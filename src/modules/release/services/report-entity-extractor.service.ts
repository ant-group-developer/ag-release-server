import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReleaseReportImportService } from './release-report-import.service';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ReleaseArtist } from '../../release-artist/entities/release-artist.entity';
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
  ) {}

  async extractAndImport(
    rows: ExtractedRow[],
    tenantId?: string,
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
      let isrc = row.isrc?.trim() || '';
      let upc = row.upc?.trim() || '';
      
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

    const inputs: any[] = [];
    for (const [upc, isrcMap] of upcMap) {
      const bestRows = Array.from(isrcMap.values());
      if (bestRows.length === 0) continue;

      // Choose the overall most complete row to represent the release level metadata (album_title, artist_name, label_name)
      const representativeRow = bestRows.reduce((a, b) =>
        this.getCompletenessScore(a) >= this.getCompletenessScore(b) ? a : b,
      );

      // Filter: pgTracks (real ISRCs) vs upcTracks (temporary album-level ISRC in format UPC-xxx)
      const pgTracks = bestRows
        .filter((r) => !r.isrc || !r.isrc.trim().toUpperCase().startsWith('UPC-'))
        .map((r) => ({
          title: r.track_title?.trim() || `Track ${r.isrc?.trim() || ''}`,
          isrc: r.isrc?.trim() || '',
        }));

      const upcTracks = bestRows
        .filter((r) => r.isrc && r.isrc.trim().toUpperCase().startsWith('UPC-'))
        .map((r) => ({
          title: r.track_title?.trim() || `Track ${r.isrc?.trim() || ''}`,
          isrc: r.isrc?.trim() || '',
        }));

      inputs.push({
        upc,
        tenantId: resolvedTenantId || undefined,
        labelName: representativeRow.label_name?.trim() || undefined,
        title: representativeRow.album_title?.trim() || representativeRow.track_title?.trim() || `Release ${upc}`,
        artistName: representativeRow.artist_name?.trim() || 'Unknown Artist',
        tracks: pgTracks,
        upcTracks,
      });
    }

    // Log inputs to analytics JSON files
    try {
      const logDir = 'd:\\ANT_1\\ag-release-server\\analytics';
      if (fs.existsSync(logDir)) {
        const timestamp = Date.now();
        const detailFile = path.join(logDir, `imported_entities_${timestamp}.json`);
        const latestFile = path.join(logDir, 'latest_imported_metadata.json');
        const jsonContent = JSON.stringify(inputs, null, 2);
        
        fs.writeFileSync(detailFile, jsonContent, 'utf-8');
        fs.writeFileSync(latestFile, jsonContent, 'utf-8');
        this.logger.log(`Logged Postgres import payload to ${detailFile} and ${latestFile}`);
      }
    } catch (logErr) {
      this.logger.error(`Failed to log Postgres import data to file: ${logErr.message}`);
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const input of inputs) {
      try {
        // Import release and real tracks into PostgreSQL
        const release = await this.releaseReportImportService.importRelease(input);

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
    if (row.track_title?.trim()) score++;
    if (row.artist_name?.trim()) score++;
    if (row.album_title?.trim()) score++;
    if (row.label_name?.trim()) score++;
    return score;
  }
}
