import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReleaseReportImportService } from './release-report-import.service';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ReleaseArtist } from '../../release-artist/entities/release-artist.entity';
import { MetadataEnrichmentService, EnrichedMetadata } from '../../partners-api/spotify/services/metadata-enrichment.service';
import { ReleaseEnrichment, ReleaseEnrichmentStatus } from '../entities/release-enrichment.entity';
import { hasMeaningfulText } from '../../etl/utils/fact-row-normalizer.util';
import { normalizeUpc } from 'src/utils/upc.util';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtractedRow {
  isrc?: string;
  upc?: string;
  track_title?: string;
  artist_name?: string;
  album_title?: string;
  label_name?: string;
}

@Injectable()
export class ReportEntityExtractorService {
  private readonly logger = new Logger(ReportEntityExtractorService.name);

  constructor(
    private readonly releaseReportImportService: ReleaseReportImportService,
    private readonly dataSource: DataSource,
    private readonly clickHouseService: ClickHouseService,
    private readonly metadataEnrichmentService: MetadataEnrichmentService,
  ) {}

  async extractAndImport(
    rows: ExtractedRow[],
    tenantId?: string,
    labelId?: string,
  ): Promise<{
    totalReleases: number;
    created: number;
    skipped: number;
    errors: number;
  }> {
    const resolvedTenantId = tenantId === 'system-tenant' ? undefined : tenantId;

    if (!rows || rows.length === 0) {
      return { totalReleases: 0, created: 0, skipped: 0, errors: 0 };
    }

    const upcMap = new Map<string, Map<string, ExtractedRow>>();

    for (const row of rows) {
      let isrc = this.cleanMeaningfulText(row.isrc);
      let upc = normalizeUpc(this.cleanMeaningfulText(row.upc));
      
      // Chỉ bỏ qua khi thiếu cả hai
      if (!isrc && !upc) continue;

      // Nếu thiếu upc nhưng có isrc: sinh upc dạng ISRC-mã_isrc
      if (!upc && isrc) {
        upc = `ISRC-${isrc}`;
      }

      if (!upcMap.has(upc)) {
        upcMap.set(upc, new Map());
      }
      const isrcMap = upcMap.get(upc)!;

      // Keep the most complete row for each unique ISRC
      const existing = isrcMap.get(isrc);
      if (!existing || this.getCompletenessScore(row) > this.getCompletenessScore(existing)) {
        isrcMap.set(isrc, row);
      }
    }

    // ─────────────────────────────────────────────────────
    // ENRICHMENT STEP: Call Spotify/Deezer APIs to fill in
    // missing metadata (UPC, album title, artist, label, etc.)
    // ─────────────────────────────────────────────────────
    const enrichedMap = await this.enrichGroupedData(upcMap);

    const resolvedUpcMap = new Map<string, Map<string, ExtractedRow>>();
    for (const [upc, isrcMap] of upcMap) {
      const bestRows = Array.from(isrcMap.values());
      if (bestRows.length === 0) continue;

      const representativeRow = bestRows.reduce((a, b) =>
        this.getCompletenessScore(a) >= this.getCompletenessScore(b) ? a : b,
      );
      const enrichedUpc = this.applyEnrichment(upc, representativeRow, bestRows, enrichedMap);

      if (!resolvedUpcMap.has(enrichedUpc)) {
        resolvedUpcMap.set(enrichedUpc, new Map());
      }
      const resolvedIsrcMap = resolvedUpcMap.get(enrichedUpc)!;

      for (const row of bestRows) {
        const isrc = this.cleanMeaningfulText(row.isrc);
        const key = isrc || `UPC-${enrichedUpc}`;
        const existing = resolvedIsrcMap.get(key);
        if (!existing || this.getCompletenessScore(row) > this.getCompletenessScore(existing)) {
          resolvedIsrcMap.set(key, row);
        }
      }
    }

    const inputs: any[] = [];
    for (const [upc, isrcMap] of resolvedUpcMap) {
      const bestRows = Array.from(isrcMap.values());
      if (bestRows.length === 0) continue;

      // Choose the overall most complete row to represent the release level metadata (album_title, artist_name, label_name)
      const representativeRow = bestRows.reduce((a, b) =>
        this.getCompletenessScore(a) >= this.getCompletenessScore(b) ? a : b,
      );

      // Filter: pgTracks (real ISRCs) vs upcTracks (temporary album-level ISRC in format UPC-xxx)
      const pgTracks = bestRows
        .filter((r) => !this.cleanMeaningfulText(r.isrc).toUpperCase().startsWith('UPC-'))
        .map((r) => ({
          title: hasMeaningfulText(r.track_title) ? r.track_title!.trim() : `Track ${this.cleanMeaningfulText(r.isrc)}`,
          isrc: this.cleanMeaningfulText(r.isrc),
        }));

      // Merge remaining tracks of the album from Spotify/Deezer if successfully enriched
      let enriched: EnrichedMetadata | undefined;
      for (const row of bestRows) {
        const isrc = this.cleanMeaningfulText(row.isrc).toUpperCase();
        if (!isrc) continue;
        enriched = enrichedMap.get(isrc);
        if (enriched) break;
      }

      if (enriched && enriched.tracks && enriched.tracks.length > 0) {
        for (const apiTrack of enriched.tracks) {
          if (!apiTrack.isrc) continue;
          const exists = pgTracks.some((t) => t.isrc.trim().toUpperCase() === apiTrack.isrc.trim().toUpperCase());
          if (!exists) {
            pgTracks.push({
              title: apiTrack.title,
              isrc: apiTrack.isrc,
            });
          }
        }
      }

      const upcTracks = bestRows
        .filter((r) => this.cleanMeaningfulText(r.isrc).toUpperCase().startsWith('UPC-'))
        .map((r) => ({
          title: hasMeaningfulText(r.track_title) ? r.track_title!.trim() : `Track ${this.cleanMeaningfulText(r.isrc)}`,
          isrc: this.cleanMeaningfulText(r.isrc),
        }));
      const apiLabelName = hasMeaningfulText(enriched?.labelName)
        ? enriched!.labelName!.trim()
        : undefined;

      inputs.push({
        upc,
        tenantId: resolvedTenantId || undefined,
        labelId: apiLabelName ? undefined : labelId?.trim() || undefined,
        labelName: apiLabelName,
        title: hasMeaningfulText(representativeRow.album_title)
          ? representativeRow.album_title!.trim()
          : hasMeaningfulText(representativeRow.track_title)
          ? representativeRow.track_title!.trim()
          : `Release ${upc}`,
        artistName: hasMeaningfulText(representativeRow.artist_name) ? representativeRow.artist_name!.trim() : undefined,
        tracks: pgTracks,
        upcTracks,
        bestRows,
      });
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const input of inputs) {
      try {
        // Import release and real tracks into PostgreSQL
        const release = await this.releaseReportImportService.importRelease(input);

        // Check and save ReleaseEnrichment status if enrichment was attempted during import
        let enriched: EnrichedMetadata | undefined;
        let triedEnrichment = false;
        if (input.bestRows) {
          for (const row of input.bestRows) {
            const isrc = this.cleanMeaningfulText(row.isrc);
            if (!isrc) continue;
            if (isrc.toUpperCase().startsWith('UPC-')) continue;
            triedEnrichment = true;
            enriched = enrichedMap.get(isrc);
            if (enriched) break;
          }
        }

        if (triedEnrichment) {
          try {
            const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
            let reRecord = await enrichmentRepo.findOne({ where: { releaseId: release.id } });
            if (!reRecord) {
              reRecord = enrichmentRepo.create({ releaseId: release.id });
            }
            reRecord.status = enriched ? ReleaseEnrichmentStatus.SUCCESS : ReleaseEnrichmentStatus.NOT_FOUND;
            reRecord.lastScannedAt = new Date();
            reRecord.lastScanId = 'import-job';
            reRecord.errorMessage = null;
            reRecord.enrichmentSource = enriched?.source || null;

            await enrichmentRepo.save(reRecord);
            this.logger.log(`Saved ReleaseEnrichment status ${reRecord.status} for release ${release.id} during import`);
          } catch (reErr) {
            this.logger.warn(`Failed to save ReleaseEnrichment record for release ${release.id}: ${reErr.message}`);
          }
        }

        // Directly insert temporary UPC- ISRCs into pg_tracks_sync ClickHouse table
        if (input.upcTracks && input.upcTracks.length > 0) {
          let artistIds: string[] = [];
          try {
            const releaseArtists = await this.dataSource.getRepository(ReleaseArtist).find({
              where: { releaseId: release.id },
              select: ['artistId'],
            });
            artistIds = releaseArtists.map((ra) => ra.artistId).filter(Boolean);
          } catch (err) {
            this.logger.warn(`Failed to fetch artist IDs for release ${release.id}: ${err.message}`);
          }

          const chData = input.upcTracks.map((track: any) => ({
            isrc: track.isrc,
            tenant_id: release.tenantId || '',
            release_id: release.id,
            label_id: release.labelId || '',
            artist_ids: artistIds,
            is_deleted: 0,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          }));

          this.logger.log(`Inserting ${chData.length} temporary UPC track(s) directly into pg_tracks_sync for release ${release.id}`);
          await this.clickHouseService.insert(
            CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
            chData,
          ).catch((err) => {
            this.logger.error(`Failed to insert temporary UPC tracks into pg_tracks_sync: ${err.message}`);
          });
        }

        if (release.isImportedFromReport) {
          created++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        this.logger.error(
          `Failed to extract/import release from report for UPC=${input.upc}: ${err.message}`,
          err.stack,
        );
      }
    }

    return {
      totalReleases: inputs.length,
      created,
      skipped,
      errors,
    };
  }

  private getCompletenessScore(row: ExtractedRow): number {
    let score = 0;
    if (hasMeaningfulText(row.track_title)) score++;
    if (hasMeaningfulText(row.artist_name)) score++;
    if (hasMeaningfulText(row.album_title)) score++;
    if (hasMeaningfulText(row.label_name)) score++;
    return score;
  }

  private cleanMeaningfulText(value: string | null | undefined): string {
    return hasMeaningfulText(value) ? value!.trim() : '';
  }

  // ─────────────────────────────────────────────────────
  // ENRICHMENT HELPERS
  // ─────────────────────────────────────────────────────

  /**
   * Collect ISRCs that need external enrichment and batch-call
   * Spotify/Deezer to get real metadata. Returns a Map<isrc, EnrichedMetadata>.
   *
   * We enrich when:
   *   - UPC is a placeholder (starts with "ISRC-")
   *   - OR metadata fields are missing (album_title, artist_name, label_name)
   */
  /**
   * Collect ISRCs that need external enrichment and batch-call
   * Spotify/Deezer to get real metadata. Returns a Map<isrc, EnrichedMetadata>.
   *
   * Optimizations:
   *   - Always lookup metadata from Spotify/Deezer for every imported release.
   *   - Only query the first valid track's ISRC per release to avoid rate limiting and redundant calls.
   */
  private async enrichGroupedData(
    upcMap: Map<string, Map<string, ExtractedRow>>,
  ): Promise<Map<string, EnrichedMetadata>> {
    const isrcsToEnrich: string[] = [];

    for (const [upc, isrcMap] of upcMap) {
      const bestRows = Array.from(isrcMap.values());

      for (const row of bestRows) {
        const isrc = this.cleanMeaningfulText(row.isrc);
        if (!isrc) continue;
        // Skip fake ISRCs (UPC- prefix) — they have no real ISRC to look up
        if (isrc.toUpperCase().startsWith('UPC-')) continue;

        // Query only the first valid track's ISRC per release
        isrcsToEnrich.push(isrc);
        break;
      }
    }

    if (isrcsToEnrich.length === 0) {
      return new Map();
    }

    this.logger.log(
      `🔍 Enrichment: Querying Spotify/Deezer for ${isrcsToEnrich.length} ISRC(s) during report import`,
    );

    try {
      return await this.metadataEnrichmentService.enrichBatch(isrcsToEnrich, {
        concurrency: 1,
        delayMs: 100,
      });
    } catch (err) {
      this.logger.error(
        `Enrichment batch failed (non-fatal, proceeding with original data): ${err.message}`,
      );
      return new Map();
    }
  }

  /**
   * Apply enriched metadata from Spotify/Deezer back into the grouped rows.
   *
   * Key logic:
   *   - If the current UPC is a placeholder ("ISRC-xxx") and we found a real
   *     UPC from the API, return the real UPC. The caller will re-group under
   *     the new UPC.
   *   - Always overwrite track_title, artist_name, album_title, label_name with official metadata.
   */
  private applyEnrichment(
    currentUpc: string,
    representativeRow: ExtractedRow,
    allRows: ExtractedRow[],
    enrichedMap: Map<string, EnrichedMetadata>,
  ): string {
    if (enrichedMap.size === 0) return currentUpc;

    // Try to find enrichment data from any ISRC in this release group
    let enriched: EnrichedMetadata | undefined;
    for (const row of allRows) {
      const isrc = this.cleanMeaningfulText(row.isrc).toUpperCase();
      if (!isrc) continue;
      enriched = enrichedMap.get(isrc);
      if (enriched) break;
    }

    if (!enriched) return currentUpc;

    // ─── Resolve UPC ─────────────────────────────────
    let resolvedUpc = normalizeUpc(currentUpc);
    const enrichedUpc = normalizeUpc(enriched.upc);
    if (enrichedUpc && resolvedUpc !== enrichedUpc) {
      resolvedUpc = enrichedUpc;
      this.logger.log(
        `✅ Enrichment: Resolved UPC ${currentUpc} → real UPC ${resolvedUpc} (via ${enriched.source})`,
      );
    }

    // ─── Overwrite representative metadata with official info ────────
    if (enriched.albumTitle) {
      representativeRow.album_title = enriched.albumTitle;
    }
    if (enriched.artistName) {
      representativeRow.artist_name = enriched.artistName;
    }
    if (enriched.labelName) {
      representativeRow.label_name = enriched.labelName;
    }

    // ─── Overwrite track titles with official info ───────────────────
    for (const row of allRows) {
      const isrc = this.cleanMeaningfulText(row.isrc).toUpperCase();
      if (!isrc) continue;
      const trackEnriched = enrichedMap.get(isrc);
      if (!trackEnriched) continue;

      if (trackEnriched.trackTitle) {
        row.track_title = trackEnriched.trackTitle;
      }
      if (trackEnriched.artistName) {
        row.artist_name = trackEnriched.artistName;
      }
    }

    return resolvedUpc;
  }
}
