import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import {
  ImportJobSourceType,
  ImportJobStatus,
} from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { DeleteImportedReleasesDto } from '../dto/report-import.dto';

export interface DeleteImportedReleasesResult {
  matchedReleases: number;
  matchedTracks: number;
  deletedReleases: number;
  deletedTracks: number;
  matchedByTenant: Record<string, number>;
  matchedBySourceType: Record<string, number>;
  matchedByFile: Record<string, number>;
  warnings: string[];
}

export interface DeleteImportedReleasesJobResult {
  jobId: string;
  status: ImportJobStatus;
  eventsUrl: string;
}

@Injectable()
export class ImportedReleaseDeleteService {
  private readonly logger = new Logger(ImportedReleaseDeleteService.name);
  private readonly chunkSize = 500;

  constructor(
    private readonly dataSource: DataSource,
    private readonly clickHouseService: ClickHouseService,
    private readonly importJobsService: ImportJobsService,
  ) {}

  async createDeleteJob(
    dto: DeleteImportedReleasesDto,
    userId?: string,
  ): Promise<DeleteImportedReleasesJobResult> {
    const range = this.validateDeleteRequest(dto);
    const summary = await this.getDeleteSummary(dto, range);
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.REPORT_RELEASE_DELETE,
      params: {
        ...dto,
        resolvedFromDateUtc: range.fromDate?.toISOString() ?? null,
        resolvedToDateUtc: range.toDate?.toISOString() ?? null,
        matchedReleases: summary.matchedReleases,
        matchedTracks: summary.matchedTracks,
      },
      fileName: dto.fileName ?? '',
      progressTotal: summary.matchedReleases,
      tenantId: dto.tenantId ?? 'system-tenant',
      createdBy: userId ?? '',
    });

    await this.importJobsService.markQueued(job.id);

    setImmediate(() => {
      void this.runDeleteJob(job.id, dto, summary, range);
    });

    return {
      jobId: job.id,
      status: ImportJobStatus.QUEUED,
      eventsUrl: `/report-import/releases/delete/${job.id}/events`,
    };
  }

  async deleteImportedReleases(
    dto: DeleteImportedReleasesDto,
  ): Promise<DeleteImportedReleasesResult> {
    const range = this.validateDeleteRequest(dto);

    const summary = await this.getDeleteSummary(dto, range);
    const result: DeleteImportedReleasesResult = {
      ...summary,
      deletedReleases: 0,
      deletedTracks: 0,
      warnings: [],
    };

    while (true) {
      const releaseIds = await this.getNextReleaseIdChunk(dto, range);
      if (!releaseIds.length) break;

      const chunkResult = await this.dataSource.transaction((manager) =>
        this.deleteReleaseChunk(manager, releaseIds),
      );

      result.deletedReleases += chunkResult.deletedReleases;
      result.deletedTracks += chunkResult.deletedTracks;

      await this.deleteClickHouseTrackMappings(releaseIds).catch((err) => {
        const message = `Failed to delete pg_tracks_sync mappings for ${releaseIds.length} release(s): ${err.message}`;
        this.logger.error(message, err.stack);
        result.warnings.push(message);
      });
    }

    return result;
  }

  private async runDeleteJob(
    jobId: string,
    dto: DeleteImportedReleasesDto,
    summary: Pick<
      DeleteImportedReleasesResult,
      | 'matchedReleases'
      | 'matchedTracks'
      | 'matchedByTenant'
      | 'matchedBySourceType'
      | 'matchedByFile'
    >,
    range: { fromDate?: Date; toDate?: Date },
  ): Promise<void> {
    const result: DeleteImportedReleasesResult = {
      ...summary,
      deletedReleases: 0,
      deletedTracks: 0,
      warnings: [],
    };

    try {
      await this.importJobsService.markProcessing(jobId);
      await this.importJobsService.updateProgress(
        jobId,
        {
          progressCurrent: 0,
          progressTotal: summary.matchedReleases,
          progressLabel: `Deleting imported releases: 0/${summary.matchedReleases}`,
          totalRows: summary.matchedReleases,
          processedRows: 0,
        },
        true,
      );

      while (true) {
        const releaseIds = await this.getNextReleaseIdChunk(dto, range);
        if (!releaseIds.length) break;

        const chunkResult = await this.dataSource.transaction((manager) =>
          this.deleteReleaseChunk(manager, releaseIds),
        );

        result.deletedReleases += chunkResult.deletedReleases;
        result.deletedTracks += chunkResult.deletedTracks;

        await this.deleteClickHouseTrackMappings(releaseIds).catch((err) => {
          const message = `Failed to delete pg_tracks_sync mappings for ${releaseIds.length} release(s): ${err.message}`;
          this.logger.error(message, err.stack);
          result.warnings.push(message);
        });

        await this.importJobsService.updateProgress(jobId, {
          progressCurrent: result.deletedReleases,
          progressTotal: summary.matchedReleases,
          progressLabel: `Deleting imported releases: ${result.deletedReleases}/${summary.matchedReleases}`,
          totalRows: summary.matchedReleases,
          processedRows: result.deletedReleases,
        });
      }

      await this.importJobsService.markCompleted(jobId, {
        ...result,
        totalRows: result.matchedReleases,
        totalProcessedRows: result.deletedReleases,
        processedRows: result.deletedReleases,
      });
    } catch (error) {
      await this.importJobsService.markFailed(
        jobId,
        error instanceof Error ? error : String(error),
      );
    }
  }

  private validateDeleteRequest(dto: DeleteImportedReleasesDto): {
    fromDate?: Date;
    toDate?: Date;
  } {
    const hasFilter = Boolean(
      dto.fromDate ||
        dto.toDate ||
        dto.tenantId ||
        dto.labelId ||
        dto.importSourceType ||
        dto.parserCode ||
        dto.fileName,
    );

    if (!hasFilter && dto.deleteAll !== true) {
      throw new BadRequestException(
        'At least one filter is required unless deleteAll is true',
      );
    }

    const fromDate = dto.fromDate
      ? this.parseReportDeleteDate(dto.fromDate, 'fromDate')
      : undefined;
    const toDate = dto.toDate
      ? this.parseReportDeleteDate(dto.toDate, 'toDate')
      : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate must be before or equal to toDate');
    }

    return { fromDate, toDate };
  }

  private buildFilteredReleaseQuery(
    dto: DeleteImportedReleasesDto,
    range: { fromDate?: Date; toDate?: Date },
  ): SelectQueryBuilder<Release> {
    const qb = this.dataSource
      .getRepository(Release)
      .createQueryBuilder('release')
      .where('release.isImportedFromReport = :isImportedFromReport', {
        isImportedFromReport: true,
      });

    if (range.fromDate) {
      qb.andWhere('release.createdAt >= :fromDate', {
        fromDate: range.fromDate,
      });
    }

    if (range.toDate) {
      qb.andWhere('release.createdAt <= :toDate', {
        toDate: range.toDate,
      });
    }

    if (dto.tenantId) {
      qb.andWhere('release.tenantId = :tenantId', {
        tenantId: dto.tenantId,
      });
    }

    if (dto.labelId) {
      qb.andWhere('release.labelId = :labelId', {
        labelId: dto.labelId,
      });
    }

    if (dto.importSourceType) {
      qb.andWhere('release.importSourceType = :importSourceType', {
        importSourceType: dto.importSourceType,
      });
    }

    if (dto.parserCode) {
      qb.andWhere('release.importParserCode = :parserCode', {
        parserCode: dto.parserCode,
      });
    }

    if (dto.fileName) {
      qb.andWhere('release.importFileName = :fileName', {
        fileName: dto.fileName,
      });
    }

    return qb;
  }

  private async getDeleteSummary(
    dto: DeleteImportedReleasesDto,
    range: { fromDate?: Date; toDate?: Date },
  ): Promise<
    Pick<
      DeleteImportedReleasesResult,
      | 'matchedReleases'
      | 'matchedTracks'
      | 'matchedByTenant'
      | 'matchedBySourceType'
      | 'matchedByFile'
    >
  > {
    const counts = await this.buildFilteredReleaseQuery(dto, range)
      .leftJoin('release.tracks', 'track')
      .select('COUNT(DISTINCT release.id)', 'matchedReleases')
      .addSelect('COUNT(DISTINCT track.id)', 'matchedTracks')
      .getRawOne<{ matchedReleases: string; matchedTracks: string }>();

    return {
      matchedReleases: Number(counts?.matchedReleases ?? 0),
      matchedTracks: Number(counts?.matchedTracks ?? 0),
      matchedByTenant: await this.getGroupedCounts(dto, range, 'release.tenantId'),
      matchedBySourceType: await this.getGroupedCounts(
        dto,
        range,
        'release.importSourceType',
      ),
      matchedByFile: await this.getGroupedCounts(dto, range, 'release.importFileName'),
    };
  }

  private async getGroupedCounts(
    dto: DeleteImportedReleasesDto,
    range: { fromDate?: Date; toDate?: Date },
    column: string,
  ): Promise<Record<string, number>> {
    const rows = await this.buildFilteredReleaseQuery(dto, range)
      .select(column, 'key')
      .addSelect('COUNT(DISTINCT release.id)', 'count')
      .groupBy(column)
      .getRawMany<{ key: string | null; count: string }>();

    return Object.fromEntries(
      rows.map((row) => [row.key || 'UNKNOWN', Number(row.count ?? 0)]),
    );
  }

  private async getNextReleaseIdChunk(
    dto: DeleteImportedReleasesDto,
    range: { fromDate?: Date; toDate?: Date },
  ): Promise<string[]> {
    const rows = await this.buildFilteredReleaseQuery(dto, range)
      .select('release.id', 'id')
      .orderBy('release.createdAt', 'ASC')
      .addOrderBy('release.id', 'ASC')
      .limit(this.chunkSize)
      .getRawMany<{ id: string }>();

    return rows.map((row) => row.id).filter(Boolean);
  }

  private parseReportDeleteDate(value: string, fieldName: string): Date {
    const trimmed = value.trim();
    const normalized = trimmed.replace(' ', 'T');
    const hasTime = /T\d{2}:\d{2}/.test(normalized);
    const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized);

    const defaultTime =
      fieldName === 'toDate' ? 'T23:59:59.999' : 'T00:00:00';
    const isoValue = hasTime ? normalized : `${normalized}${defaultTime}`;
    const valueWithTimezone = hasTimezone ? isoValue : `${isoValue}+07:00`;
    const parsed = new Date(valueWithTimezone);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is not a valid datetime`);
    }

    return parsed;
  }

  private async deleteReleaseChunk(
    manager: EntityManager,
    releaseIds: string[],
  ): Promise<{ deletedReleases: number; deletedTracks: number }> {
    const tracks = await manager.getRepository(Track).find({
      where: { releaseId: In(releaseIds) },
      select: ['id'],
    });
    const trackIds = tracks.map((track) => track.id);

    await this.deleteTrackRelations(manager, trackIds);
    await this.deleteReleaseRelations(manager, releaseIds);

    if (trackIds.length) {
      await this.deleteByIds(manager, 'tracks', 'id', trackIds);
    }

    await this.deleteByIds(manager, 'releases', 'id', releaseIds);

    return {
      deletedReleases: releaseIds.length,
      deletedTracks: trackIds.length,
    };
  }

  private async deleteTrackRelations(
    manager: EntityManager,
    trackIds: string[],
  ): Promise<void> {
    if (!trackIds.length) return;

    await this.safeDeleteByIds(manager, 'audio_files', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_artist', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_contributors', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_language', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_localize', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_policy', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_scan_histories', 'track_id', trackIds);
    await this.safeDeleteByIds(manager, 'track_revenue', 'track_id', trackIds);
  }

  private async deleteReleaseRelations(
    manager: EntityManager,
    releaseIds: string[],
  ): Promise<void> {
    const videoRows = await manager.query(
      `SELECT id FROM videos WHERE release_id = ANY($1)`,
      [releaseIds],
    );
    const videoIds = videoRows.map((row: { id: string }) => row.id);

    if (videoIds.length) {
      await this.safeDeleteByIds(manager, 'video_artist', 'video_id', videoIds);
      await this.safeDeleteByIds(manager, 'video_contributors', 'video_id', videoIds);
      await this.safeDeleteByIds(manager, 'video_genres', 'video_id', videoIds);
    }

    await this.safeDeleteByIds(manager, 'release_artist', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_contributors', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_localize', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_cover_art', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_dsp_delivery', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_territories', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_language', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_enrichments', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_logs', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'release_captions', 'release_id', releaseIds);
    await this.safeDeleteByIds(manager, 'videos', 'release_id', releaseIds);

    await manager.query(
      `UPDATE ci_distribution_jobs3 SET release_id = NULL WHERE release_id = ANY($1)`,
      [releaseIds],
    ).catch(() => undefined);
  }

  private async deleteByIds(
    manager: EntityManager,
    table: string,
    column: string,
    ids: string[],
  ): Promise<void> {
    const chunkSize = 5000;
    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      await manager
        .createQueryBuilder()
        .delete()
        .from(table)
        .where(`${column} IN (:...ids)`, { ids: chunk })
        .execute();
    }
  }

  private async safeDeleteByIds(
    manager: EntityManager,
    table: string,
    column: string,
    ids: string[],
  ): Promise<void> {
    try {
      await this.deleteByIds(manager, table, column, ids);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === '42P01') {
        this.logger.warn(`Skip cleanup for missing table "${table}"`);
        return;
      }
      throw error;
    }
  }

  private async deleteClickHouseTrackMappings(
    releaseIds: string[],
  ): Promise<void> {
    if (!releaseIds.length) return;
    const idsSql = releaseIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(', ');

    await this.clickHouseService.execute(
      `ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} DELETE WHERE release_id IN (${idsSql})`,
    );
    await this.clickHouseService.waitForTableMutations(
      CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
    );
  }
}
