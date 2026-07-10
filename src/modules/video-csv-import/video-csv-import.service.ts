import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parse } from 'csv-parse/sync';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { ChangeLogEntry } from 'src/modules/partners-api/spotify/services/metadata-sync.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseReportImportService } from 'src/modules/release/services/release-report-import.service';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { VideoArtist } from 'src/modules/video-artist/entities/video-artist.entity';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
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
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		@InjectRepository(TrackArtist)
		private readonly trackArtistRepo: Repository<TrackArtist>,
		@InjectRepository(VideoArtist)
		private readonly videoArtistRepo: Repository<VideoArtist>,
		private readonly dataSource: DataSource,
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
			});
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

		// 1. Check existing video by ISRC
		const existingVideo = await this.videoRepo.findOne({
			where: { isrc },
			order: { createdAt: 'ASC' },
		});

		if (existingVideo) {
			result.matchedExistingVideo++;

			const existingRelease = await this.releaseRepo.findOne({
				where: { id: existingVideo.releaseId },
			});

			if (existingRelease?.isImportedFromReport) {
				// Update release type to video if still audio
				if (existingRelease.type === 'audio') {
					await this.releaseRepo.update(existingRelease.id, { type: 'video' });
					this.logger.log(
						`[CSV Import] Fixed release ${existingRelease.id} type=audio→video for ISRC=${isrc}`,
					);
				}

				// Delete orphan track with same ISRC if exists (isImportedFromReport only)
				const orphanTrack = await this.trackRepo.findOne({
					where: { isrc, isImportedFromReport: true },
				});
				if (orphanTrack) {
					await this.deleteTrack(orphanTrack);
					// Remove stale audio row from ClickHouse
					await this.deleteClickHouseTrackRow(isrc);
					this.logger.log(
						`[CSV Import] Deleted orphan track ${orphanTrack.id} ISRC=${isrc}, synced ClickHouse`,
					);
				}
			}

			if (channel && !existingVideo.channelId) {
				await this.videoRepo.update(existingVideo.id, { channelId: channel.id });
				result.channelLinked++;
				changeLogs.push(this.buildLogEntry(existingVideo.id, existingVideo.releaseId, isrc, channel.id, nowStr));
			}
			return;
		}

		// 2. Check existing track by ISRC (audio release imported from report)
		const existingTrack = await this.trackRepo.findOne({
			where: { isrc, isImportedFromReport: true },
			order: { createdAt: 'ASC' },
		});

		if (existingTrack) {
			const release = await this.releaseRepo.findOne({
				where: { id: existingTrack.releaseId, isImportedFromReport: true },
			});

			if (release) {
				const video = await this.convertTrackToVideo(existingTrack, release, channel, changeLogs, nowStr);
				// Remove stale audio row from ClickHouse (track was deleted in transaction)
				if (existingTrack.isrc) {
					await this.deleteClickHouseTrackRow(existingTrack.isrc);
				}
				result.matchedExistingVideo++;
				if (channel && video) result.channelLinked++;
			} else {
				this.logger.warn(
					`[CSV Import] Track ISRC=${isrc} found but release is not imported-from-report, skipping convert`,
				);
				result.rowsSkipped++;
			}
			return;
		}

		// 3. No existing track/video → create new Release + Video
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

		const newVideo = await this.videoRepo.findOne({ where: { releaseId: release.id } });
		if (!newVideo) {
			this.logger.warn(`[CSV Import] Video not found after create for release=${release.id}`);
			return;
		}

		await this.videoRepo.update(newVideo.id, { channelId: channel.id });
		result.channelLinked++;
		changeLogs.push(this.buildLogEntry(newVideo.id, release.id, isrc, channel.id, nowStr));
	}

	/**
	 * Convert an existing audio track (isImportedFromReport) to video:
	 *   1. Update release.type → 'video'
	 *   2. Delete track_artists (no CASCADE), then delete track
	 *   3. Create Video record, migrate TrackArtists → VideoArtists
	 */
	private async convertTrackToVideo(
		track: Track,
		release: Release,
		channel: Channel | null,
		changeLogs: ChangeLogEntry[],
		nowStr: string,
	): Promise<Video | null> {
		return this.dataSource.transaction(async (manager) => {
			// Update release type to video
			await manager.update(Release, release.id, { type: 'video' });

			// Fetch track artists before deleting track
			const trackArtists = await manager.find(TrackArtist, { where: { trackId: track.id } });

			// Delete track_artists manually (no CASCADE on DB)
			if (trackArtists.length > 0) {
				await manager.delete(TrackArtist, { trackId: track.id });
			}

			// Delete track (cascade handles track_contributors, track_revenues, track_policies)
			await manager.delete(Track, track.id);

			// Create Video
			const video = await manager.save(
				Video,
				manager.create(Video, {
					releaseId: release.id,
					isrc: track.isrc,
					...(channel ? { channelId: channel.id } : {}),
				}),
			);

			// Migrate TrackArtists → VideoArtists
			for (const ta of trackArtists) {
				await manager.save(
					VideoArtist,
					manager.create(VideoArtist, {
						videoId: video.id,
						artistId: ta.artistId,
					}),
				);
			}

			if (channel) {
				changeLogs.push(this.buildLogEntry(video.id, release.id, track.isrc ?? '', channel.id, nowStr));
			}

			this.logger.log(
				`[CSV Import] Converted track ${track.id} (ISRC=${track.isrc}) → video ${video.id}, release ${release.id} type=audio→video`,
			);

			return video;
		});
	}

	/** Xóa track và track_artists (không có CASCADE trên DB) */
	private async deleteTrack(track: Track): Promise<void> {
		await this.trackArtistRepo.delete({ trackId: track.id });
		await this.trackRepo.delete(track.id);
	}

	/** Xóa row trong ClickHouse pg_tracks_sync theo ISRC */
	private async deleteClickHouseTrackRow(isrc: string): Promise<void> {
		const safeIsrc = isrc.replace(/'/g, "''");
		await this.clickHouseService.execute(
			`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} DELETE WHERE isrc = '${safeIsrc}'`,
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
