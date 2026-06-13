import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Like, ILike, Brackets } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { MetadataEnrichmentService, EnrichedMetadata } from './metadata-enrichment.service';

/** Single field-level change logged to ClickHouse */
interface ChangeLogEntry {
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

export interface ScanResult {
	scanId: string;
	totalScanned: number;
	enriched: number;
	upcResolved: number;
	metadataUpdated: number;
	errors: number;
	changesLogged: number;
	details: Array<{
		isrc: string;
		action: string;
		source?: string;
		oldUpc?: string;
		newUpc?: string;
	}>;
}

@Injectable()
export class MetadataScanService {
	private readonly logger = new Logger(MetadataScanService.name);

	constructor(
		private readonly dataSource: DataSource,
		private readonly metadataEnrichmentService: MetadataEnrichmentService,
		private readonly clickHouseService: ClickHouseService,
	) {}

	/**
	 * Scan releases imported from reports and enrich metadata via Spotify/Deezer.
	 * Every change is logged to ClickHouse `metadata_enrichment_log`.
	 *
	 * @param options.limit  - Max releases to process (default 50 for testing)
	 * @param options.dryRun - Preview changes without writing to PostgreSQL
	 */
	async scanAndEnrichAll(options?: {
		limit?: number;
		dryRun?: boolean;
		scanId?: string;
	}): Promise<ScanResult> {
		const limit = options?.limit;
		const dryRun = options?.dryRun ?? false;
		const scanId = options?.scanId ?? uuidv4();

		const result: ScanResult = {
			scanId,
			totalScanned: 0,
			enriched: 0,
			upcResolved: 0,
			metadataUpdated: 0,
			errors: 0,
			changesLogged: 0,
			details: [],
		};

		const changeLogs: ChangeLogEntry[] = [];
		const now = new Date().toISOString().slice(0, 23).replace('T', ' ');

		this.logger.log(
			`🚀 Starting metadata scan (scanId=${scanId}, limit=${limit ?? 'ALL'}, dryRun=${dryRun})...`,
		);

		// ─── 1) Find releases to enrich ──────────────────
		const releaseRepo = this.dataSource.getRepository(Release);
		const trackRepo = this.dataSource.getRepository(Track);

		// Find all releases imported from reports, ordered by creation date
		const findOptions: any = {
			where: { isImportedFromReport: true },
			relations: ['tracks', 'releaseArtists', 'releaseArtists.artist'],
			order: { createdAt: 'DESC' },
		};
		if (limit !== undefined) {
			findOptions.take = limit;
		}
		const allReleases = await releaseRepo.find(findOptions);

		this.logger.log(`Found ${allReleases.length} releases to scan (limit=${limit ?? 'ALL'})`);

		const chunkSize = 50;
		for (let rIndex = 0; rIndex < allReleases.length; rIndex += chunkSize) {
			const releaseChunk = allReleases.slice(rIndex, rIndex + chunkSize);
			this.logger.log(
				`[Scan Progress] Processing releases ${rIndex + 1} to ${Math.min(
					rIndex + chunkSize,
					allReleases.length,
				)} of ${allReleases.length}...`,
			);

			// We will resolve this chunk of releases.
			// Since some releases might need to try their 2nd, 3rd track if the 1st fails,
			// we loop until all releases in this chunk are either resolved or we have exhausted their tracks.
			const pendingReleases = releaseChunk.map(r => ({
				release: r,
				currentTrackIndex: 0,
				resolved: false,
			}));

			const chunkChangeLogs: ChangeLogEntry[] = [];

			while (pendingReleases.some(pr => !pr.resolved && pr.currentTrackIndex < (pr.release.tracks?.length ?? 0))) {
				// Collect one ISRC per pending/unresolved release
				const isrcToReleaseMap = new Map<string, { release: Release; track: Track }>();

				for (const pr of pendingReleases) {
					if (pr.resolved) continue;
					const tracks = pr.release.tracks || [];
					if (pr.currentTrackIndex >= tracks.length) continue;

					const track = tracks[pr.currentTrackIndex];
					const isrc = track.isrc?.trim()?.toUpperCase();

					if (isrc && !isrc.startsWith('UPC-')) {
						isrcToReleaseMap.set(isrc, { release: pr.release, track });
					} else {
						// Skip this invalid track and increment index immediately
						pr.currentTrackIndex++;
					}
				}

				const isrcs = Array.from(isrcToReleaseMap.keys());
				if (isrcs.length === 0) {
					// All tracks for all unresolved releases in this chunk have been exhausted
					break;
				}

				this.logger.log(`Querying Spotify/Deezer for ${isrcs.length} ISRCs (batch trial)...`);

				const enrichedMap = await this.metadataEnrichmentService.enrichBatch(isrcs, {
					concurrency: 3,
					delayMs: 300,
				});

				// Group results by release
				const releaseUpdates = new Map<
					string,
					{ release: Release; enrichedTracks: Array<{ track: Track; enriched: EnrichedMetadata }> }
				>();

				for (const [isrc, enriched] of enrichedMap) {
					const mapping = isrcToReleaseMap.get(isrc);
					if (!mapping) continue;
					const { release, track } = mapping;
					if (!releaseUpdates.has(release.id)) {
						releaseUpdates.set(release.id, { release, enrichedTracks: [] });
					}
					releaseUpdates.get(release.id)!.enrichedTracks.push({ track, enriched });
				}

				// Apply updates for releases that got successfully enriched in this round
				for (const [releaseId, { release, enrichedTracks }] of releaseUpdates) {
					try {
						if (enrichedTracks.length === 0) continue;

						const primaryEnriched = enrichedTracks[0].enriched;
						const changes: string[] = [];

						// ─── UPC Resolution ──────────────────────
						const currentUpc = release.upc?.trim();
						const apiUpc = primaryEnriched.upc?.trim();

						const needsUpcUpdate =
							!currentUpc ||
							currentUpc.toUpperCase().startsWith('ISRC-') ||
							(apiUpc && currentUpc !== apiUpc);

						if (needsUpcUpdate && apiUpc) {
							const existing = await releaseRepo.findOne({
								where: { upc: apiUpc },
							});

							if (existing) {
								if (existing.id !== release.id) {
									this.logger.log(
										`Merging duplicate release ${release.id} (UPC: ${release.upc}) into existing release ${existing.id} (UPC: ${existing.upc})`,
									);

									if (!dryRun) {
										await this.dataSource.transaction(async (manager) => {
											const releaseRepoTx = manager.getRepository(Release);
											const trackRepoTx = manager.getRepository(Track);
											const releaseArtistRepoTx = manager.getRepository(ReleaseArtist);

											// 1. Relink tracks
											const existingTracks = await trackRepoTx.find({
												where: { releaseId: existing.id },
												order: { order: 'DESC' },
												take: 1,
											});
											const maxOrder = existingTracks.length > 0 ? (existingTracks[0].order ?? 0) : 0;

											const duplicateTracks = await trackRepoTx.find({
												where: { releaseId: release.id },
												order: { order: 'ASC' },
											});

											let currentOrder = maxOrder + 1;
											for (const track of duplicateTracks) {
												await trackRepoTx.update(
													{ id: track.id },
													{
														releaseId: existing.id,
														order: currentOrder++,
													},
												);
											}

											// 2. Relink or merge release artists
											const currentArtists = await releaseArtistRepoTx.find({ where: { releaseId: release.id } });
											for (const ra of currentArtists) {
												const existsInTarget = await releaseArtistRepoTx.findOne({
													where: { releaseId: existing.id, artistId: ra.artistId },
												});
												if (!existsInTarget) {
													await releaseArtistRepoTx.update({ id: ra.id }, { releaseId: existing.id });
												} else {
													await releaseArtistRepoTx.delete({ id: ra.id });
												}
											}

											// 3. Cleanup other associated entities
											await manager.createQueryBuilder().delete().from('release_contributors').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_localize').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_cover_art').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_dsp_delivery').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_territories').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('videos').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_captions').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_logs').where('release_id = :id', { id: release.id }).execute();
											await manager.createQueryBuilder().delete().from('release_language').where('release_id = :id', { id: release.id }).execute();

											// 4. Delete duplicate release
											await releaseRepoTx.delete(release.id);
										});
									}

									changes.push(`Merged UPC: ${release.upc} → ${apiUpc} (target release: ${existing.id})`);
									result.upcResolved++;
									result.details.push({
										isrc: primaryEnriched.isrc,
										action: 'upc_merged',
										source: primaryEnriched.source,
										oldUpc: release.upc || undefined,
										newUpc: apiUpc,
									});

									chunkChangeLogs.push(
										this.buildLogEntry(scanId, now, dryRun, {
											entityType: 'release',
											entityId: release.id,
											releaseId: existing.id,
											isrc: primaryEnriched.isrc,
											upc: apiUpc,
											fieldName: 'upc_merge',
											oldValue: release.upc || '',
											newValue: `Merged into ${existing.id} (UPC: ${apiUpc})`,
											changeType: 'update',
											enriched: primaryEnriched,
										}),
									);

									try {
										const artistIds = (release.releaseArtists || []).map((ra) => ra.artistId);
										await this.clickHouseService.insert(
											CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
											[{
												isrc: `UPC-${apiUpc}`,
												tenant_id: existing.tenantId || '',
												release_id: existing.id,
												label_id: existing.labelId || '',
												artist_ids: artistIds,
												is_deleted: 0,
												updated_at: now,
											}],
										);
									} catch (chErr) {
										this.logger.error(`Failed to insert resolved UPC mapping to ClickHouse: ${chErr.message}`);
									}

									// Mark resolved and continue
									const pending = pendingReleases.find(pr => pr.release.id === releaseId);
									if (pending) pending.resolved = true;
									continue;
								}
							} else {
								if (!dryRun) {
									await releaseRepo.update(release.id, { upc: apiUpc });
								}
								changes.push(`UPC: ${release.upc} → ${apiUpc}`);
								result.upcResolved++;
								result.details.push({
									isrc: primaryEnriched.isrc,
									action: 'upc_resolved',
									source: primaryEnriched.source,
									oldUpc: release.upc || undefined,
									newUpc: apiUpc,
								});

								chunkChangeLogs.push(
									this.buildLogEntry(scanId, now, dryRun, {
										entityType: 'release',
										entityId: release.id,
										releaseId: release.id,
										isrc: primaryEnriched.isrc,
										upc: apiUpc,
										fieldName: 'upc',
										oldValue: release.upc || '',
										newValue: apiUpc,
										changeType: 'update',
										enriched: primaryEnriched,
									}),
								);

								try {
									const artistIds = (release.releaseArtists || []).map((ra) => ra.artistId);
									await this.clickHouseService.insert(
										CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
										[{
											isrc: `UPC-${apiUpc}`,
											tenant_id: release.tenantId || '',
											release_id: release.id,
											label_id: release.labelId || '',
											artist_ids: artistIds,
											is_deleted: 0,
											updated_at: now,
										}],
									);
								} catch (chErr) {
									this.logger.error(`Failed to insert resolved UPC mapping to ClickHouse: ${chErr.message}`);
								}
							}
						}

						// ─── Release Title ───────────────────────
						const currentTitle = release.title?.trim();
						const apiTitle = primaryEnriched.albumTitle?.trim();
						if (apiTitle && currentTitle !== apiTitle) {
							if (!dryRun) {
								await releaseRepo.update(release.id, { title: apiTitle });
							}
							changes.push(`Title: "${release.title}" → "${apiTitle}"`);

							chunkChangeLogs.push(
								this.buildLogEntry(scanId, now, dryRun, {
									entityType: 'release',
									entityId: release.id,
									releaseId: release.id,
									isrc: primaryEnriched.isrc,
									upc: release.upc || '',
									fieldName: 'title',
									oldValue: release.title || '',
									newValue: apiTitle,
									changeType: 'update',
									enriched: primaryEnriched,
								}),
							);
						}

						// ─── Release Date ────────────────────────
						const apiReleaseDateStr = primaryEnriched.releaseDate ? new Date(primaryEnriched.releaseDate!).toISOString().slice(0, 10) : '';
						const currentReleaseDateStr = release.releaseDate ? new Date(release.releaseDate).toISOString().slice(0, 10) : '';

						if (apiReleaseDateStr && currentReleaseDateStr !== apiReleaseDateStr) {
							if (!dryRun) {
								await releaseRepo.update(release.id, {
									releaseDate: new Date(primaryEnriched.releaseDate!),
								});
							}
							changes.push(`ReleaseDate: ${release.releaseDate ? currentReleaseDateStr : 'null'} → ${apiReleaseDateStr}`);

							chunkChangeLogs.push(
								this.buildLogEntry(scanId, now, dryRun, {
									entityType: 'release',
									entityId: release.id,
									releaseId: release.id,
									isrc: primaryEnriched.isrc,
									upc: release.upc || '',
									fieldName: 'release_date',
									oldValue: release.releaseDate ? currentReleaseDateStr : '',
									newValue: apiReleaseDateStr,
									changeType: 'update',
									enriched: primaryEnriched,
								}),
							);
						}

						// ─── Track Titles ────────────────────────
						for (const { track, enriched } of enrichedTracks) {
							const currentTrackTitle = track.title?.trim();
							const apiTrackTitle = enriched.trackTitle?.trim();
							if (apiTrackTitle && currentTrackTitle !== apiTrackTitle) {
								if (!dryRun) {
									await trackRepo.update(track.id, { title: apiTrackTitle });
								}
								changes.push(
									`Track[${track.isrc}] title: "${track.title}" → "${apiTrackTitle}"`,
								);

								chunkChangeLogs.push(
									this.buildLogEntry(scanId, now, dryRun, {
										entityType: 'track',
										entityId: track.id,
										releaseId: release.id,
										isrc: track.isrc || '',
										upc: release.upc || '',
										fieldName: 'title',
										oldValue: track.title || '',
										newValue: apiTrackTitle,
										changeType: 'update',
										enriched,
									}),
								);
							}
						}

						// ─── Artist ──────────────────────────────
						if (primaryEnriched.artistName) {
							const hasExactArtist = (release.releaseArtists || []).some(
								(ra) => ra.artist?.name?.trim()?.toLowerCase() === primaryEnriched.artistName?.trim()?.toLowerCase()
							);
							if (!hasExactArtist) {
								if (!dryRun) {
									await this.ensureArtistLink(release, primaryEnriched.artistName);
								}
								changes.push(`Artist: added "${primaryEnriched.artistName}"`);

								chunkChangeLogs.push(
									this.buildLogEntry(scanId, now, dryRun, {
										entityType: 'artist',
										entityId: release.id,
										releaseId: release.id,
										isrc: primaryEnriched.isrc,
										upc: release.upc || '',
										fieldName: 'artist_name',
										oldValue: (release.releaseArtists || []).map(ra => ra.artist?.name).filter(Boolean).join(', '),
										newValue: primaryEnriched.artistName,
										changeType: 'create',
										enriched: primaryEnriched,
									}),
								);
							}
						}

						if (changes.length > 0) {
							result.enriched++;
							result.metadataUpdated += changes.length;
							this.logger.log(
								`✅ Release ${releaseId}: ${changes.join(' | ')} (via ${primaryEnriched.source})`,
							);
							result.details.push({
								isrc: primaryEnriched.isrc,
								action: 'metadata_updated',
								source: primaryEnriched.source,
							});
						}

						// Mark this release as successfully resolved so we don't try other tracks on it!
						const pending = pendingReleases.find(pr => pr.release.id === releaseId);
						if (pending) pending.resolved = true;

					} catch (err) {
						result.errors++;
						this.logger.error(`Failed to update release ${releaseId}: ${err.message}`);
					}
				}

				// For releases that were NOT enriched in this round, increment their track index to try their next track
				for (const pr of pendingReleases) {
					if (!pr.resolved) {
						const triedTrack = pr.release.tracks?.[pr.currentTrackIndex];
						if (triedTrack) {
							const triedIsrc = triedTrack.isrc?.trim()?.toUpperCase();
							if (triedIsrc && isrcToReleaseMap.has(triedIsrc) && !enrichedMap.has(triedIsrc)) {
								pr.currentTrackIndex++;
							}
						}
					}
				}
			}

			// ─── 6) Flush change logs to ClickHouse immediately for this chunk ─────────
			if (chunkChangeLogs.length > 0) {
				try {
					await this.clickHouseService.insert(
						CLICKHOUSE_TABLES.METADATA_ENRICHMENT_LOG,
						chunkChangeLogs as unknown as Record<string, unknown>[],
					);
					result.changesLogged += chunkChangeLogs.length;
					this.logger.log(
						`📝 Logged ${chunkChangeLogs.length} change(s) from current chunk to ClickHouse (scanId=${scanId})`,
					);
				} catch (err) {
					this.logger.error(`Failed to log chunk changes to ClickHouse: ${err.message}`);
				}
			}
		}

		this.logger.log(
			`🏁 Scan complete (scanId=${scanId}): ${result.totalScanned} scanned, ` +
				`${result.enriched} enriched, ${result.upcResolved} UPCs resolved, ` +
				`${result.metadataUpdated} fields updated, ${result.changesLogged} logged, ` +
				`${result.errors} errors`,
		);

		return result;
	}

	/**
	 * Enrich a single ISRC (useful for testing).
	 */
	async enrichSingleIsrc(isrc: string): Promise<EnrichedMetadata | null> {
		return this.metadataEnrichmentService.enrichByIsrc(isrc);
	}

	/**
	 * Query change history from ClickHouse.
	 */
	async getChangeHistory(query: {
		scanId?: string;
		isrc?: string;
		releaseId?: string;
		limit?: number;
	}): Promise<any[]> {
		const conditions: string[] = [];
		const params: Record<string, unknown> = {};

		if (query.scanId) {
			conditions.push('scan_id = {scanId: String}');
			params.scanId = query.scanId;
		}
		if (query.isrc) {
			conditions.push('isrc = {isrc: String}');
			params.isrc = query.isrc;
		}
		if (query.releaseId) {
			conditions.push('release_id = {releaseId: String}');
			params.releaseId = query.releaseId;
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
		const limitClause = `LIMIT ${query.limit || 100}`;

		return this.clickHouseService.query(
			`SELECT *
			 FROM ${CLICKHOUSE_TABLES.METADATA_ENRICHMENT_LOG}
			 ${whereClause}
			 ORDER BY created_at DESC
			 ${limitClause}`,
			params,
		);
	}

	// ─────────────────────────────────────────────────────
	// PRIVATE HELPERS
	// ─────────────────────────────────────────────────────

	private buildLogEntry(
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

	private async ensureArtistLink(release: Release, artistName: string): Promise<void> {
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
}
