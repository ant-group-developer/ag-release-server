
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In, ILike } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackRevenue } from 'src/modules/track-revenue/entities/track-revenue.entity';
import { TrackScanHistory } from 'src/modules/copyright/entities/track-scan-history.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { EnrichedMetadata } from './metadata-enrichment.service';
import { stringToCode } from 'src/utils/util';

export interface ChangeLogEntry {
	id: string;
	scan_id: string;
	entity_type: string;
	entity_id: string;
	release_id: string;
	isrc: string;
	upc: string;
	field_name: string;
	old_value: string;
	new_value: string;
	change_type: string;
	enrichment_source: string;
	api_track_id: string;
	api_album_id: string;
	api_artist_id: string;
	status: string;
	error_message: string;
	is_dry_run: number;
	created_at: string;
	created_by: string;
}

@Injectable()
export class MetadataSyncService {
	private readonly logger = new Logger(MetadataSyncService.name);

	constructor(
		private readonly dataSource: DataSource,
		private readonly clickHouseService: ClickHouseService,
	) {}

	buildLogEntry(
		scanId: string,
		createdAt: string,
		dryRun: boolean,
		data: {
			entityType: string;
			entityId: string;
			releaseId: string;
			isrc: string;
			upc: string;
			fieldName: string;
			oldValue: string;
			newValue: string;
			changeType: string;
			enriched: EnrichedMetadata;
		},
	): ChangeLogEntry {
		return {
			id: uuidv4(),
			scan_id: scanId,
			entity_type: data.entityType,
			entity_id: data.entityId,
			release_id: data.releaseId,
			isrc: data.isrc,
			upc: data.upc,
			field_name: data.fieldName,
			old_value: data.oldValue,
			new_value: data.newValue,
			change_type: data.changeType,
			enrichment_source: data.enriched.source,
			api_track_id: data.enriched.trackSpotifyId || '',
			api_album_id: data.enriched.albumSpotifyId || data.enriched.albumDeezerId || '',
			api_artist_id: data.enriched.artistSpotifyId || data.enriched.artistDeezerId || '',
			status: dryRun ? 'dry_run' : 'applied',
			error_message: '',
			is_dry_run: dryRun ? 1 : 0,
			created_at: createdAt,
			created_by: '',
		};
	}

	async syncExternalMetadataJson(
		release: Release,
		enriched: EnrichedMetadata,
		dryRun: boolean,
		now: string,
		scanId: string,
		chunkChangeLogs: ChangeLogEntry[],
		changes: string[],
	): Promise<void> {
		const releaseRepo = this.dataSource.getRepository(Release);
		const trackRepo = this.dataSource.getRepository(Track);
		const lastSyncedAt = new Date().toISOString();

		const releasePatch: Partial<Release> = {};
		if (this.hasSpotifyMetadata(enriched)) {
			const spotifyReleaseMetadata = this.buildReleaseSpotifyMetadata(release.metadataSpotify, enriched, lastSyncedAt);
			if (this.hasJsonChanged(release.metadataSpotify, spotifyReleaseMetadata)) {
				releasePatch.metadataSpotify = spotifyReleaseMetadata as Release['metadataSpotify'];
				changes.push('Release Spotify metadata updated');
				chunkChangeLogs.push(
					this.buildLogEntry(scanId, now, dryRun, {
						entityType: 'release',
						entityId: release.id,
						releaseId: release.id,
						isrc: enriched.isrc,
						upc: release.upc || enriched.upc || '',
						fieldName: 'metadata_spotify',
						oldValue: JSON.stringify(release.metadataSpotify || null),
						newValue: JSON.stringify(spotifyReleaseMetadata),
						changeType: 'link',
						enriched,
					}),
				);
			}
		}

		if (this.hasDeezerMetadata(enriched)) {
			const deezerReleaseMetadata = this.buildReleaseDeezerMetadata((release as any).metadataDeezer, enriched, lastSyncedAt);
			if (this.hasJsonChanged((release as any).metadataDeezer, deezerReleaseMetadata)) {
				(releasePatch as any).metadataDeezer = deezerReleaseMetadata;
				changes.push('Release Deezer metadata updated');
				chunkChangeLogs.push(
					this.buildLogEntry(scanId, now, dryRun, {
						entityType: 'release',
						entityId: release.id,
						releaseId: release.id,
						isrc: enriched.isrc,
						upc: release.upc || enriched.upc || '',
						fieldName: 'metadata_deezer',
						oldValue: JSON.stringify((release as any).metadataDeezer || null),
						newValue: JSON.stringify(deezerReleaseMetadata),
						changeType: 'link',
						enriched,
					}),
				);
			}
		}

		if (Object.keys(releasePatch).length > 0 && !dryRun) {
			await releaseRepo.update(release.id, releasePatch);
			Object.assign(release, releasePatch);
		}

		const tracks = release.tracks?.length
			? release.tracks
			: await trackRepo.find({ where: { releaseId: release.id } });

		const tracksByIsrc = new Map<string, NonNullable<EnrichedMetadata['tracks']>[number]>();
		for (const apiTrack of enriched.tracks || []) {
			const key = this.normalizeIsrc(apiTrack.isrc);
			if (key) tracksByIsrc.set(key, apiTrack);
		}
		if (enriched.isrc) {
			const key = this.normalizeIsrc(enriched.isrc);
			if (key && !tracksByIsrc.has(key)) {
				tracksByIsrc.set(key, {
					isrc: enriched.isrc,
					title: enriched.trackTitle,
					duration: enriched.trackDuration,
					spotifyId: enriched.trackSpotifyId,
					deezerId: enriched.trackDeezerId,
					spotifyUrl: enriched.trackSpotifyUrl,
					deezerUrl: enriched.trackDeezerUrl,
				});
			}
		}

		for (const track of tracks) {
			const apiTrack = tracksByIsrc.get(this.normalizeIsrc(track.isrc || ''));
			if (!apiTrack) continue;

			const trackPatch: Partial<Track> = {};

			if (this.hasSpotifyTrackMetadata(enriched, apiTrack)) {
				const spotifyTrackMetadata = this.buildTrackSpotifyMetadata((track as any).metadataSpotify, enriched, apiTrack, lastSyncedAt);
				if (this.hasJsonChanged((track as any).metadataSpotify, spotifyTrackMetadata)) {
					(trackPatch as any).metadataSpotify = spotifyTrackMetadata;
					changes.push(`Track[${track.isrc}] Spotify metadata updated`);
					chunkChangeLogs.push(
						this.buildLogEntry(scanId, now, dryRun, {
							entityType: 'track',
							entityId: track.id,
							releaseId: release.id,
							isrc: track.isrc || apiTrack.isrc,
							upc: release.upc || enriched.upc || '',
							fieldName: 'metadata_spotify',
							oldValue: JSON.stringify((track as any).metadataSpotify || null),
							newValue: JSON.stringify(spotifyTrackMetadata),
							changeType: 'link',
							enriched,
						}),
					);
				}
			}

			if (this.hasDeezerTrackMetadata(enriched, apiTrack)) {
				const deezerTrackMetadata = this.buildTrackDeezerMetadata((track as any).metadataDeezer, enriched, apiTrack, lastSyncedAt);
				if (this.hasJsonChanged((track as any).metadataDeezer, deezerTrackMetadata)) {
					(trackPatch as any).metadataDeezer = deezerTrackMetadata;
					changes.push(`Track[${track.isrc}] Deezer metadata updated`);
					chunkChangeLogs.push(
						this.buildLogEntry(scanId, now, dryRun, {
							entityType: 'track',
							entityId: track.id,
							releaseId: release.id,
							isrc: track.isrc || apiTrack.isrc,
							upc: release.upc || enriched.upc || '',
							fieldName: 'metadata_deezer',
							oldValue: JSON.stringify((track as any).metadataDeezer || null),
							newValue: JSON.stringify(deezerTrackMetadata),
							changeType: 'link',
							enriched,
						}),
					);
				}
			}

			if (Object.keys(trackPatch).length > 0 && !dryRun) {
				await trackRepo.update(track.id, trackPatch);
				Object.assign(track, trackPatch);
			}
		}
	}

	async syncReleaseLabelFromEnriched(
		release: Release,
		enriched: EnrichedMetadata,
		dryRun: boolean,
		now: string,
		scanId: string,
		changeLogs: ChangeLogEntry[],
		changes: string[],
		identifiers: { isrc?: string; upc?: string },
	): Promise<void> {
		const labelName = enriched.labelName?.trim();
		if (!labelName || labelName.toUpperCase() === 'N/A') return;

		const label = await this.resolveOrCreateApiLabel(release.tenantId, labelName);
		if (!label || release.labelId === label.id) return;

		const oldLabelId = release.labelId || '';
		const oldLabelName = release.label?.name?.trim();
		const oldValue = oldLabelName ? `${oldLabelId} (${oldLabelName})` : oldLabelId;
		const newValue = `${label.id} (${label.name})`;

		if (!dryRun) {
			await this.dataSource.getRepository(Release).update(release.id, {
				labelId: label.id,
			});
			release.labelId = label.id;
			release.label = label;
		}

		changes.push(`Label: "${oldValue || 'null'}" -> "${label.name}"`);
		changeLogs.push(
			this.buildLogEntry(scanId, now, dryRun, {
				entityType: 'release',
				entityId: release.id,
				releaseId: release.id,
				isrc: identifiers.isrc || enriched.isrc || '',
				upc: identifiers.upc || release.upc || '',
				fieldName: 'label_id',
				oldValue,
				newValue,
				changeType: 'update',
				enriched,
			}),
		);
	}

	async ensureArtistLink(release: Release, artistName: string): Promise<void> {
		const artistRepo = this.dataSource.getRepository(Artist);
		const releaseArtistRepo = this.dataSource.getRepository(ReleaseArtist);
		const trackArtistRepo = this.dataSource.getRepository(TrackArtist);

		let artist = await artistRepo.findOne({
			where: { name: ILike(artistName.trim()) },
			order: { createdAt: 'ASC' },
		});

		if (!artist) {
			const { nanoid } = await import('nanoid');
			artist = await artistRepo.save(
				artistRepo.create({
					name: artistName.trim(),
					code: nanoid(10),
					isImportedFromReport: true,
				}),
			);
		}

		const existingLink = await releaseArtistRepo.findOne({
			where: { releaseId: release.id, artistId: artist.id },
		});

		if (!existingLink) {
			const releaseArtist = await releaseArtistRepo.save(
				releaseArtistRepo.create({
					releaseId: release.id,
					artistId: artist.id,
					addArtistToTracks: true,
					isImportedFromReport: true,
				}),
			);

			const tracks = await this.dataSource.getRepository(Track).find({
				where: { releaseId: release.id },
			});

			for (const track of tracks) {
				const existingTrackArtist = await trackArtistRepo.findOne({
					where: { trackId: track.id, artistId: artist.id },
				});
				if (!existingTrackArtist) {
					await trackArtistRepo.save(
						trackArtistRepo.create({
							trackId: track.id,
							artistId: artist.id,
							releaseArtistId: releaseArtist.id,
							isFromReleaseAction: true,
							isImportedFromReport: true,
						}),
					);
				}
			}
		}
	}

	async mergeDuplicateTrackRowsWithManager(
		manager: EntityManager,
		canonicalTrackId: string,
		duplicateTrackIds: string[],
	): Promise<void> {
		if (duplicateTrackIds.length === 0) return;

		await manager.update(TrackRevenue, { trackId: In(duplicateTrackIds) }, { trackId: canonicalTrackId });
		await manager.update(TrackScanHistory, { trackId: In(duplicateTrackIds) }, { trackId: canonicalTrackId });
		await manager.delete(TrackLanguage, { trackId: In(duplicateTrackIds) });
		await manager.delete(TrackArtist, { trackId: In(duplicateTrackIds) });
		await manager.delete(TrackContributor, { trackId: In(duplicateTrackIds) });
		await manager.delete(TrackLocalize, { trackId: In(duplicateTrackIds) });
		await manager.delete(AudioFile, { trackId: In(duplicateTrackIds) });
		await manager.delete(TrackPolicy, { trackId: In(duplicateTrackIds) });
		await manager.delete(Track, { id: In(duplicateTrackIds) });
	}

	buildLogMetadataForTrack(
		isrc: string,
		apiTrack?: { title?: string; spotifyId?: string; deezerId?: string },
	): EnrichedMetadata {
		return {
			source: 'local',
			isrc,
			trackTitle: apiTrack?.title || '',
			trackSpotifyId: apiTrack?.spotifyId,
			trackDeezerId: apiTrack?.deezerId,
			artistName: '',
			upc: '',
			albumTitle: '',
		};
	}

	async syncReleaseTracks(
		release: Release,
		apiTracks: Array<{ isrc: string; title: string; duration?: number; trackNumber?: number; spotifyId?: string; deezerId?: string; spotifyUrl?: string; deezerUrl?: string }>,
		dryRun: boolean,
		primaryEnriched: EnrichedMetadata,
		now: string,
		scanId: string,
		chunkChangeLogs: any[],
		changes: string[],
	): Promise<void> {
		const trackRepo = this.dataSource.getRepository(Track);
		const trackArtistRepo = this.dataSource.getRepository(TrackArtist);

		this.logger.log(`Syncing ${apiTracks.length} track(s) for release ${release.id}`);

		// 1. Fetch artists for link
		let releaseArtists: ReleaseArtist[] = [];
		try {
			releaseArtists = await this.dataSource.getRepository(ReleaseArtist).find({
				where: { releaseId: release.id },
				relations: ['artist'],
			});
		} catch (err) {
			this.logger.warn(`Failed to fetch release artists: ${err.message}`);
		}

		// 2. Fetch existing tracks in DB for this release
		let dbTracks = await trackRepo.find({
			where: { releaseId: release.id },
		});
		dbTracks = await this.compactDuplicateTracksWithinRelease(
			release,
			dbTracks,
			apiTracks,
			dryRun,
			now,
			scanId,
			chunkChangeLogs,
			changes,
		);

		// 3. Move existing track orders to a temporary high range to avoid UQ_tracks_release_id_order conflicts
		if (!dryRun) {
			for (const track of dbTracks) {
				await trackRepo.update({ id: track.id }, { order: track.order + 10000 });
			}
		}

		const usedOrders = new Set<number>();

		// 4. Upsert/Create tracks
		for (const apiTrack of apiTracks) {
			if (!apiTrack.isrc) continue;

			const targetOrder = apiTrack.trackNumber || 1;
			usedOrders.add(targetOrder);

			// Find if this ISRC already exists in our db tracks
			const existingTrack = dbTracks.find(
				(t) => t.isrc?.trim().toUpperCase() === apiTrack.isrc.trim().toUpperCase()
			);

			if (existingTrack) {
				// Update existing track to its official order and title if changed
				const trackPatch: Partial<Track> = {
					title: apiTrack.title,
					order: targetOrder,
				};
				const lastSyncedAt = new Date().toISOString();
				if (this.hasSpotifyTrackMetadata(primaryEnriched, apiTrack)) {
					(trackPatch as any).metadataSpotify = this.buildTrackSpotifyMetadata(
						(existingTrack as any).metadataSpotify,
						primaryEnriched,
						apiTrack,
						lastSyncedAt,
					);
				}
				if (this.hasDeezerTrackMetadata(primaryEnriched, apiTrack)) {
					(trackPatch as any).metadataDeezer = this.buildTrackDeezerMetadata(
						(existingTrack as any).metadataDeezer,
						primaryEnriched,
						apiTrack,
						lastSyncedAt,
					);
				}

				if (!dryRun) {
					await trackRepo.update(
						{ id: existingTrack.id },
						trackPatch,
					);
				}
				
				const hasChanges = existingTrack.title !== apiTrack.title || existingTrack.order !== targetOrder;
				if (hasChanges) {
					changes.push(`Track[${apiTrack.isrc}] updated: "${apiTrack.title}" (order: ${targetOrder})`);
				}
			} else {
				const duplicateTrack = await trackRepo
					.createQueryBuilder('track')
					.leftJoinAndSelect('track.release', 'duplicateRelease')
					.where('UPPER(track.isrc) = :isrc', {
						isrc: apiTrack.isrc.trim().toUpperCase(),
					})
					.andWhere('track.releaseId != :releaseId', { releaseId: release.id })
					.getOne();

				if (duplicateTrack?.release?.tenantId === release.tenantId) {
					if (duplicateTrack.release.isImportedFromReport) {
						const duplicateTrackPatch: Partial<Track> = {
							releaseId: release.id,
							title: apiTrack.title,
							order: targetOrder,
						};
						const lastSyncedAt = new Date().toISOString();
						if (this.hasSpotifyTrackMetadata(primaryEnriched, apiTrack)) {
							(duplicateTrackPatch as any).metadataSpotify = this.buildTrackSpotifyMetadata(
								(duplicateTrack as any).metadataSpotify,
								primaryEnriched,
								apiTrack,
								lastSyncedAt,
							);
						}
						if (this.hasDeezerTrackMetadata(primaryEnriched, apiTrack)) {
							(duplicateTrackPatch as any).metadataDeezer = this.buildTrackDeezerMetadata(
								(duplicateTrack as any).metadataDeezer,
								primaryEnriched,
								apiTrack,
								lastSyncedAt,
							);
						}

						if (!dryRun) {
							await trackRepo.update(
								{ id: duplicateTrack.id },
								duplicateTrackPatch,
							);
						}

						changes.push(
							`Track[${apiTrack.isrc}] moved from duplicate release ${duplicateTrack.releaseId} to ${release.id}`,
						);
						chunkChangeLogs.push(
							this.buildLogEntry(scanId, now, dryRun, {
								entityType: 'track',
								entityId: duplicateTrack.id,
								releaseId: release.id,
								isrc: apiTrack.isrc,
								upc: release.upc || '',
								fieldName: 'duplicate_isrc_merge',
								oldValue: duplicateTrack.releaseId,
								newValue: release.id,
								changeType: 'merge',
								enriched: primaryEnriched,
							}),
						);

						try {
							const artistIds = releaseArtists.map((ra) => ra.artistId).filter(Boolean);
							await this.clickHouseService.insert(
								CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
								[{
									isrc: apiTrack.isrc,
									tenant_id: release.tenantId || '',
									release_id: release.id,
									label_id: release.labelId || '',
									artist_ids: artistIds,
									is_deleted: 0,
									updated_at: now.slice(0, 19),
								}],
							);
						} catch (chErr) {
							this.logger.error(`Failed to sync duplicate ISRC ${apiTrack.isrc} mapping: ${chErr.message}`);
						}

						continue;
					}

					changes.push(
						`Track[${apiTrack.isrc}] duplicate exists on non-imported release ${duplicateTrack.releaseId}; skipped create`,
					);
					chunkChangeLogs.push(
						this.buildLogEntry(scanId, now, dryRun, {
							entityType: 'track',
							entityId: duplicateTrack.id,
							releaseId: release.id,
							isrc: apiTrack.isrc,
							upc: release.upc || '',
							fieldName: 'duplicate_isrc_skip',
							oldValue: duplicateTrack.releaseId,
							newValue: release.id,
							changeType: 'skip',
							enriched: primaryEnriched,
						}),
					);
					continue;
				}

				// Create new track
				let newTrack: Track | undefined;
				if (!dryRun) {
					const createPayload: Partial<Track> = {
						releaseId: release.id,
						isrc: apiTrack.isrc,
						title: apiTrack.title,
						order: targetOrder,
						isImportedFromReport: true,
					};
					const lastSyncedAt = new Date().toISOString();
					if (this.hasSpotifyTrackMetadata(primaryEnriched, apiTrack)) {
						(createPayload as any).metadataSpotify = this.buildTrackSpotifyMetadata(
							null,
							primaryEnriched,
							apiTrack,
							lastSyncedAt,
						);
					}
					if (this.hasDeezerTrackMetadata(primaryEnriched, apiTrack)) {
						(createPayload as any).metadataDeezer = this.buildTrackDeezerMetadata(
							null,
							primaryEnriched,
							apiTrack,
							lastSyncedAt,
						);
					}
					newTrack = await trackRepo.save(
						trackRepo.create(createPayload)
					);

					// Link track to artists
					for (const ra of releaseArtists) {
						await trackArtistRepo.save(
							trackArtistRepo.create({
								trackId: newTrack!.id,
								artistId: ra.artistId,
								releaseArtistId: ra.id,
								isFromReleaseAction: true,
								isImportedFromReport: true,
							})
						);
					}
				}

				changes.push(`Track[${apiTrack.isrc}]: created "${apiTrack.title}"`);
				chunkChangeLogs.push(
					this.buildLogEntry(scanId, now, dryRun, {
						entityType: 'track',
						entityId: newTrack?.id || uuidv4(),
						releaseId: release.id,
						isrc: apiTrack.isrc,
						upc: release.upc || '',
						fieldName: 'create_track',
						oldValue: '',
						newValue: apiTrack.title,
						changeType: 'create',
						enriched: primaryEnriched,
					}),
				);

				// Sync new track to ClickHouse pg_tracks_sync
				try {
					const artistIds = releaseArtists.map((ra) => ra.artistId).filter(Boolean);
					await this.clickHouseService.insert(
						CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
						[{
							isrc: apiTrack.isrc,
							tenant_id: release.tenantId || '',
							release_id: release.id,
							label_id: release.labelId || '',
							artist_ids: artistIds,
							is_deleted: 0,
							updated_at: now.slice(0, 19),
						}],
					);
				} catch (chErr) {
					this.logger.error(`Failed to insert track ${apiTrack.isrc} into pg_tracks_sync: ${chErr.message}`);
				}
			}
		}

		// 5. Restore any remaining db tracks that were NOT updated to their final order
		if (!dryRun) {
			const finalDbTracks = await trackRepo.find({
				where: { releaseId: release.id },
			});
			for (const track of finalDbTracks) {
				if (track.order >= 10000) {
					let restoreOrder = track.order - 10000;
					while (usedOrders.has(restoreOrder)) {
						restoreOrder++;
					}
					await trackRepo.update({ id: track.id }, { order: restoreOrder });
					usedOrders.add(restoreOrder);
				}
			}
		}
	}

	private async resolveOrCreateApiLabel(
		tenantId: string | null | undefined,
		labelName: string,
	): Promise<Label | null> {
		const name = labelName.trim();
		if (!tenantId || !name) return null;

		const labelRepo = this.dataSource.getRepository(Label);
		const existing = await labelRepo.findOne({
			where: { tenantId, name: ILike(name) },
			order: { createdAt: 'ASC' },
		});
		if (existing) return existing;

		const { nanoid } = await import('nanoid');
		const baseCode = stringToCode(name) || `API_${nanoid(6)}`;
		let code = baseCode;

		while (await labelRepo.exists({ where: { tenantId, code } })) {
			code = `${baseCode}_${nanoid(6)}`;
		}

		return labelRepo.save(
			labelRepo.create({
				name,
				code,
				tenantId,
				isImportedFromReport: true,
			}),
		);
	}

	private async compactDuplicateTracksWithinRelease(
		release: Release,
		dbTracks: Track[],
		apiTracks: Array<{ isrc: string; title: string; trackNumber?: number }>,
		dryRun: boolean,
		now: string,
		scanId: string,
		chunkChangeLogs: ChangeLogEntry[],
		changes: string[],
	): Promise<Track[]> {
		const groups = new Map<string, Track[]>();
		for (const track of dbTracks) {
			const normalizedIsrc = this.normalizeIsrc(track.isrc);
			if (!normalizedIsrc) continue;
			const group = groups.get(normalizedIsrc) || [];
			group.push(track);
			groups.set(normalizedIsrc, group);
		}

		const deletedTrackIds = new Set<string>();

		for (const [isrc, tracks] of groups) {
			if (tracks.length <= 1) continue;

			const apiTrack = apiTracks.find(
				(track) => this.normalizeIsrc(track.isrc) === isrc,
			);
			const canonical = this.pickCanonicalTrack(tracks, apiTrack);
			const duplicateTracks = tracks.filter((track) => track.id !== canonical.id);
			const deletableDuplicates = duplicateTracks.filter((track) => track.isImportedFromReport);
			const skippedDuplicates = duplicateTracks.filter((track) => !track.isImportedFromReport);

			for (const duplicate of skippedDuplicates) {
				changes.push(
					`Track[${isrc}] duplicate ${duplicate.id} is not report-imported; skipped deletion`,
				);
				chunkChangeLogs.push(
					this.buildLogEntry(scanId, now, dryRun, {
						entityType: 'track',
						entityId: duplicate.id,
						releaseId: release.id,
						isrc,
						upc: release.upc || '',
						fieldName: 'duplicate_isrc_same_release_skip',
						oldValue: duplicate.id,
						newValue: canonical.id,
						changeType: 'skip',
						enriched: this.buildLogMetadataForTrack(isrc, apiTrack),
					}),
				);
			}

			if (!deletableDuplicates.length) continue;

			const duplicateIds = deletableDuplicates.map((track) => track.id);
			if (!dryRun) {
				await this.mergeDuplicateTrackRows(canonical.id, duplicateIds);
			}

			for (const duplicate of deletableDuplicates) {
				deletedTrackIds.add(duplicate.id);
				changes.push(
					`Track[${isrc}] duplicate ${duplicate.id} merged into ${canonical.id}`,
				);
				chunkChangeLogs.push(
					this.buildLogEntry(scanId, now, dryRun, {
						entityType: 'track',
						entityId: duplicate.id,
						releaseId: release.id,
						isrc,
						upc: release.upc || '',
						fieldName: 'duplicate_isrc_same_release_merge',
						oldValue: duplicate.id,
						newValue: canonical.id,
						changeType: 'merge',
						enriched: this.buildLogMetadataForTrack(isrc, apiTrack),
					}),
				);
			}
		}

		return dbTracks.filter((track) => !deletedTrackIds.has(track.id));
	}

	private async mergeDuplicateTrackRows(
		canonicalTrackId: string,
		duplicateTrackIds: string[],
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			await this.mergeDuplicateTrackRowsWithManager(
				manager,
				canonicalTrackId,
				duplicateTrackIds,
			);
		});
	}

	private pickCanonicalTrack(
		tracks: Track[],
		apiTrack?: { title?: string; trackNumber?: number },
	): Track {
		const normalizedApiTitle = apiTrack?.title?.trim().toLowerCase();
		const apiOrder = apiTrack?.trackNumber;

		return [...tracks].sort((a, b) => {
			const aTitleScore = normalizedApiTitle && a.title?.trim().toLowerCase() === normalizedApiTitle ? 0 : 1;
			const bTitleScore = normalizedApiTitle && b.title?.trim().toLowerCase() === normalizedApiTitle ? 0 : 1;
			if (aTitleScore !== bTitleScore) return aTitleScore - bTitleScore;

			const aOrderScore = apiOrder !== undefined && a.order === apiOrder ? 0 : 1;
			const bOrderScore = apiOrder !== undefined && b.order === apiOrder ? 0 : 1;
			if (aOrderScore !== bOrderScore) return aOrderScore - bOrderScore;

			return (a.order ?? 0) - (b.order ?? 0);
		})[0];
	}

	private buildReleaseSpotifyMetadata(
		current: Release['metadataSpotify'],
		enriched: EnrichedMetadata,
		lastSyncedAt: string,
	) {
		return {
			...(current || {}),
			albumId: enriched.albumSpotifyId || current?.albumId || null,
			albumUrl: enriched.albumSpotifyUrl || current?.albumUrl || null,
			coverImages: (enriched.albumCoverImages || [])
				.filter((image) => image.source === 'spotify')
				.map(({ source, ...image }) => image),
			trackLinks: (enriched.tracks || [])
				.filter((track) => track.isrc && (track.spotifyId || track.spotifyUrl))
				.map((track) => ({
					isrc: track.isrc,
					spotifyId: track.spotifyId || null,
					spotifyUrl: track.spotifyUrl || null,
				})),
			lastSyncedAt,
		};
	}

	private buildReleaseDeezerMetadata(
		current: any,
		enriched: EnrichedMetadata,
		lastSyncedAt: string,
	) {
		return {
			...(current || {}),
			albumId: enriched.albumDeezerId || current?.albumId || null,
			albumUrl: enriched.albumDeezerUrl || current?.albumUrl || null,
			coverImages: (enriched.albumCoverImages || [])
				.filter((image) => image.source === 'deezer')
				.map(({ source, ...image }) => image),
			trackLinks: (enriched.tracks || [])
				.filter((track) => track.isrc && (track.deezerId || track.deezerUrl))
				.map((track) => ({
					isrc: track.isrc,
					deezerId: track.deezerId || null,
					deezerUrl: track.deezerUrl || null,
				})),
			lastSyncedAt,
		};
	}

	private buildTrackSpotifyMetadata(
		current: any,
		enriched: EnrichedMetadata,
		apiTrack: NonNullable<EnrichedMetadata['tracks']>[number],
		lastSyncedAt: string,
	) {
		return {
			...(current || {}),
			trackId: apiTrack.spotifyId || current?.trackId || null,
			trackUrl: apiTrack.spotifyUrl || current?.trackUrl || null,
			albumId: enriched.albumSpotifyId || current?.albumId || null,
			albumUrl: enriched.albumSpotifyUrl || current?.albumUrl || null,
			lastSyncedAt,
		};
	}

	private buildTrackDeezerMetadata(
		current: any,
		enriched: EnrichedMetadata,
		apiTrack: NonNullable<EnrichedMetadata['tracks']>[number],
		lastSyncedAt: string,
	) {
		return {
			...(current || {}),
			trackId: apiTrack.deezerId || current?.trackId || null,
			trackUrl: apiTrack.deezerUrl || current?.trackUrl || null,
			albumId: enriched.albumDeezerId || current?.albumId || null,
			albumUrl: enriched.albumDeezerUrl || current?.albumUrl || null,
			lastSyncedAt,
		};
	}

	private hasJsonChanged(current: unknown, next: unknown): boolean {
		return JSON.stringify(current || null) !== JSON.stringify(next || null);
	}

	private hasSpotifyMetadata(enriched: EnrichedMetadata): boolean {
		return Boolean(
			enriched.albumSpotifyId ||
				enriched.albumSpotifyUrl ||
				(enriched.albumCoverImages || []).some((image) => image.source === 'spotify') ||
				(enriched.tracks || []).some((track) => track.spotifyId || track.spotifyUrl),
		);
	}

	private hasDeezerMetadata(enriched: EnrichedMetadata): boolean {
		return Boolean(
			enriched.albumDeezerId ||
				enriched.albumDeezerUrl ||
				(enriched.albumCoverImages || []).some((image) => image.source === 'deezer') ||
				(enriched.tracks || []).some((track) => track.deezerId || track.deezerUrl),
		);
	}

	private hasSpotifyTrackMetadata(
		enriched: EnrichedMetadata,
		apiTrack: NonNullable<EnrichedMetadata['tracks']>[number],
	): boolean {
		return Boolean(apiTrack.spotifyId || apiTrack.spotifyUrl || enriched.albumSpotifyId || enriched.albumSpotifyUrl);
	}

	private hasDeezerTrackMetadata(
		enriched: EnrichedMetadata,
		apiTrack: NonNullable<EnrichedMetadata['tracks']>[number],
	): boolean {
		return Boolean(apiTrack.deezerId || apiTrack.deezerUrl || enriched.albumDeezerId || enriched.albumDeezerUrl);
	}

	private normalizeIsrc(isrc?: string | null): string {
		return isrc?.trim().toUpperCase() || '';
	}
}
