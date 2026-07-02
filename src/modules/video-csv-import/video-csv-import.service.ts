import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parse } from 'csv-parse/sync';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { ReleaseReportImportService } from 'src/modules/release/services/release-report-import.service';
import { ChangeLogEntry } from 'src/modules/partners-api/spotify/services/metadata-sync.service';
import { VideoCsvImportResult } from './dto/video-csv-import-result.dto';
import { VideoCsvRow } from './types';

@Injectable()
export class VideoCsvImportService {
	private readonly logger = new Logger(VideoCsvImportService.name);

	constructor(
		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		private readonly releaseReportImportService: ReleaseReportImportService,
		private readonly clickHouseService: ClickHouseService,
	) {}

	/**
	 * Import file CSV (buffer). Trung tam logic:
	 *   1. Match video existing theo videos.isrc -> gan channelId (chi khi dang null).
	 *   2. Video chua co -> reuse ReleaseReportImportService.importVideoRelease()
	 *      de tao Release + Video + Artist + link, dung fallback tenant ANT MUSIC LLC + label AMG.
	 *   3. Channel name khong match Postgres -> skip channel, log warn.
	 *   4. Ghi log tung thay doi vao ClickHouse metadata_enrichment_log.
	 */
	async importFromBuffer(buffer: Buffer): Promise<VideoCsvImportResult> {
		let rows: VideoCsvRow[];
		try {
			rows = parse(buffer, {
				columns: true,
				skip_empty_lines: true,
				trim: true,
				relax_quotes: true,
				bom: true,
			}) as VideoCsvRow[];
		} catch (err: any) {
			this.logger.error(`CSV parse failed: ${err.message}`);
			throw new Error(`Invalid CSV: ${err.message}`);
		}

		const result: VideoCsvImportResult = {
			totalRows: rows.length,
			matchedExistingVideo: 0,
			createdVideoRelease: 0,
			channelLinked: 0,
			channelSkipped: 0,
			rowsSkipped: 0,
			errors: [],
		};

		this.logger.log(`[CSV Import] Parsed ${rows.length} rows from CSV`);

		const nowStr = new Date().toISOString().slice(0, 23).replace('T', ' ');
		const changeLogs: ChangeLogEntry[] = [];

		for (const raw of rows) {
			const isrcRaw = raw.ISRC?.trim();
			try {
				await this.processRow(raw, result, changeLogs, nowStr);
			} catch (err: any) {
				this.logger.warn(
					`[CSV Import] Row failed isrc=${isrcRaw}: ${err.message}`,
				);
				result.errors.push({
					isrc: isrcRaw ?? '',
					message: err.message,
				});
			}
		}

		if (changeLogs.length > 0) {
			try {
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.METADATA_ENRICHMENT_LOG,
					changeLogs as unknown as Record<string, unknown>[],
				);
				this.logger.log(
					`[CSV Import] Logged ${changeLogs.length} changes to ClickHouse`,
				);
			} catch (err: any) {
				this.logger.error(
					`[CSV Import] Failed to log to ClickHouse: ${err.message}`,
				);
			}
		}

		this.logger.log(
			`[CSV Import] Done. total=${result.totalRows}, ` +
				`matched=${result.matchedExistingVideo}, created=${result.createdVideoRelease}, ` +
				`channelLinked=${result.channelLinked}, channelSkipped=${result.channelSkipped}, ` +
				`rowsSkipped=${result.rowsSkipped}, errors=${result.errors.length}`,
		);

		return result;
	}

	private async processRow(
		raw: VideoCsvRow,
		result: VideoCsvImportResult,
		changeLogs: ChangeLogEntry[],
		nowStr: string,
	): Promise<void> {
		const isrc = raw.ISRC?.trim()?.toUpperCase();
		const title = raw.Title?.trim();
		const artistName = this.parseFirstArtist(raw['Main Artist(s)']);
		const channelName = raw['Channel name']?.trim();

		if (!isrc || !title) {
			result.rowsSkipped++;
			return;
		}

		const channel = channelName
			? await this.findChannelByName(channelName)
			: null;
		if (channelName && !channel) {
			result.channelSkipped++;
			this.logger.warn(
				`[CSV Import] Channel "${channelName}" not found for ISRC ${isrc}`,
			);
		}

		// 1. Match existing video by ISRC
		const existingVideo = await this.videoRepo.findOne({
			where: { isrc },
			order: { createdAt: 'ASC' },
		});

		if (existingVideo) {
			result.matchedExistingVideo++;

			if (channel && !existingVideo.channelId) {
				await this.videoRepo.update(existingVideo.id, {
					channelId: channel.id,
				});
				result.channelLinked++;
				changeLogs.push(
					this.buildLogEntry(
						existingVideo.id,
						existingVideo.releaseId,
						isrc,
						channel.id,
						nowStr,
					),
				);
			}
			return;
		}

		// 2. Create new Release + Video via existing service (auto fallback tenant+label)
		const release = await this.releaseReportImportService.importVideoRelease({
			upc: `ISRC-${isrc}`,
			title,
			artistName: artistName || undefined,
			tracks: [{ title, isrc }],
			importSourceType: 'CSV',
			importParserCode: 'video-csv-import',
			importFileName: 'videoExports.csv',
		});
		result.createdVideoRelease++;

		if (!channel) return;

		// 3. Fetch newly created video and set channelId
		const newVideo = await this.videoRepo.findOne({
			where: { releaseId: release.id },
		});
		if (!newVideo) {
			this.logger.warn(
				`[CSV Import] Video not found after create for release=${release.id}`,
			);
			return;
		}

		await this.videoRepo.update(newVideo.id, { channelId: channel.id });
		result.channelLinked++;
		changeLogs.push(
			this.buildLogEntry(newVideo.id, release.id, isrc, channel.id, nowStr),
		);
	}

	private async findChannelByName(name: string): Promise<Channel | null> {
		return this.channelRepo
			.createQueryBuilder('c')
			.where('LOWER(c.name) = LOWER(:name)', { name })
			.getOne();
	}

	private parseFirstArtist(raw: string | undefined | null): string | null {
		if (!raw) return null;
		const first = raw.split(/[,;]/)[0]?.trim();
		return first || null;
	}

	private buildLogEntry(
		videoId: string,
		releaseId: string,
		isrc: string,
		channelId: string,
		nowStr: string,
	): ChangeLogEntry {
		return {
			id: uuidv4(),
			scan_id: '',
			entity_type: 'video',
			entity_id: videoId,
			release_id: releaseId,
			isrc,
			upc: '',
			field_name: 'channel_id',
			old_value: '',
			new_value: channelId,
			change_type: 'set',
			enrichment_source: 'csv_import',
			api_track_id: '',
			api_album_id: '',
			api_artist_id: '',
			status: 'applied',
			error_message: '',
			is_dry_run: 0,
			created_at: nowStr,
			created_by: '',
		};
	}
}
