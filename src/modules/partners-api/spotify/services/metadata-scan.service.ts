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
import { ReleaseEnrichment, ReleaseEnrichmentStatus } from 'src/modules/release/entities/release-enrichment.entity';
import { MetadataScanSession, ScanSessionStatus } from 'src/modules/release/entities/metadata-scan-session.entity';
import { EnrichEventsGateway } from './enrich-events.gateway';

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
		private readonly enrichEventsGateway: EnrichEventsGateway,
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
		force?: boolean;
	}): Promise<ScanResult> {
		const limit = options?.limit;
		const dryRun = options?.dryRun ?? false;
		const scanId = options?.scanId ?? uuidv4();
		const force = options?.force ?? false;

		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const session = sessionRepo.create({
			id: scanId,
			status: ScanSessionStatus.PROCESSING,
			totalReleases: 0,
			processedReleases: 0,
			successCount: 0,
			failedCount: 0,
			notFoundCount: 0,
			dryRun,
			force,
			limitCount: limit,
			startedAt: new Date(),
		});
		await sessionRepo.save(session);

		try {
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
			`🚀 Starting metadata scan (scanId=${scanId}, limit=${limit ?? 'ALL'}, dryRun=${dryRun}, force=${force})...`,
		);

		// ─── 1) Find releases to enrich ──────────────────
		const releaseRepo = this.dataSource.getRepository(Release);
		const trackRepo = this.dataSource.getRepository(Track);

		// Find releases imported from reports
		const queryBuilder = releaseRepo.createQueryBuilder('release')
			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('release.releaseArtists', 'releaseArtist')
			.leftJoinAndSelect('releaseArtist.artist', 'artist')
			.where('release.isImportedFromReport = :isImported', { isImported: true });

		// If not forced, only include releases without a successful or not_found enrichment record
		if (!force) {
			queryBuilder.leftJoin(ReleaseEnrichment, 're', 're.releaseId = release.id')
				.andWhere(new Brackets((qb) => {
					qb.where('re.id IS NULL')
						.orWhere('re.status NOT IN (:...excludedStatuses)', {
							excludedStatuses: [ReleaseEnrichmentStatus.SUCCESS, ReleaseEnrichmentStatus.NOT_FOUND],
						});
				}));
		}

		queryBuilder.orderBy('release.createdAt', 'DESC');

		if (limit !== undefined) {
			queryBuilder.take(limit);
		}
		const allReleases = await queryBuilder.getMany();

		session.totalReleases = allReleases.length;
		await sessionRepo.save(session);

		this.enrichEventsGateway.emit({
			scanId,
			type: 'progress',
			timestamp: new Date().toISOString(),
			data: {
				status: session.status,
				totalReleases: session.totalReleases,
				processedReleases: session.processedReleases,
				successCount: session.successCount,
				failedCount: session.failedCount,
				notFoundCount: session.notFoundCount,
			},
		});

		const countedReleaseIds = new Set<string>();
		let liveProcessedReleases = session.processedReleases;
		let liveSuccessCount = session.successCount;
		let liveFailedCount = session.failedCount;
		let liveNotFoundCount = session.notFoundCount;

		const emitProgress = () => {
			this.enrichEventsGateway.emit({
				scanId,
				type: 'progress',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					totalReleases: session.totalReleases,
					processedReleases: liveProcessedReleases,
					successCount: liveSuccessCount,
					failedCount: liveFailedCount,
					notFoundCount: liveNotFoundCount,
				},
			});
		};

		const markReleaseProgress = (
			releaseId: string,
			status: 'success' | 'failed' | 'not_found',
		) => {
			if (countedReleaseIds.has(releaseId)) return;
			countedReleaseIds.add(releaseId);

			liveProcessedReleases++;
			if (status === 'success') liveSuccessCount++;
			if (status === 'failed') liveFailedCount++;
			if (status === 'not_found') liveNotFoundCount++;

			emitProgress();
		};

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
			const chunkFailedReleases = new Set<string>();

			// Collect releases that have NO real tracks, so we can try UPC lookup on them
			const releasesForUpcLookup = pendingReleases.filter(pr => {
				const tracks = pr.release.tracks || [];
				const hasRealTracks = tracks.some(t => t.isrc && !t.isrc.trim().toUpperCase().startsWith('UPC-'));
				return !hasRealTracks && pr.release.upc && !pr.release.upc.trim().toUpperCase().startsWith('ISRC-');
			});

			if (releasesForUpcLookup.length > 0) {
				this.logger.log(`Performing UPC-based metadata lookup for ${releasesForUpcLookup.length} release(s)...`);
				for (const pr of releasesForUpcLookup) {
					try {
						// Throttle to respect API rate limits
						await new Promise((resolve) => setTimeout(resolve, 300));
						const upc = pr.release.upc!.trim();
						this.logger.log(`Querying Spotify/Deezer for UPC ${upc}...`);
						const enriched = await this.metadataEnrichmentService.enrichByUpc(upc, {
							forceExternal: force,
						});
						if (enriched) {
							const primaryEnriched = enriched;
							const changes: string[] = [];

							// ─── Release Title ───────────────────────
							const currentTitle = pr.release.title?.trim();
							const apiTitle = primaryEnriched.albumTitle?.trim();
							if (apiTitle && currentTitle !== apiTitle) {
								if (!dryRun) {
									await releaseRepo.update(pr.release.id, { title: apiTitle });
								}
								changes.push(`Title: "${pr.release.title}" → "${apiTitle}"`);
								chunkChangeLogs.push(
									this.buildLogEntry(scanId, now, dryRun, {
										entityType: 'release',
										entityId: pr.release.id,
										releaseId: pr.release.id,
										isrc: primaryEnriched.isrc || `UPC-${upc}`,
										upc,
										fieldName: 'title',
										oldValue: pr.release.title || '',
										newValue: apiTitle,
										changeType: 'update',
										enriched: primaryEnriched,
									}),
								);
							}

							// ─── Release Date ────────────────────────
							const apiReleaseDateStr = primaryEnriched.releaseDate ? new Date(primaryEnriched.releaseDate!).toISOString().slice(0, 10) : '';
							const currentReleaseDateStr = pr.release.releaseDate ? new Date(pr.release.releaseDate).toISOString().slice(0, 10) : '';

							if (apiReleaseDateStr && currentReleaseDateStr !== apiReleaseDateStr) {
								if (!dryRun) {
									await releaseRepo.update(pr.release.id, {
										releaseDate: new Date(primaryEnriched.releaseDate!),
									});
								}
								changes.push(`ReleaseDate: ${pr.release.releaseDate ? currentReleaseDateStr : 'null'} → ${apiReleaseDateStr}`);
								chunkChangeLogs.push(
									this.buildLogEntry(scanId, now, dryRun, {
										entityType: 'release',
										entityId: pr.release.id,
										releaseId: pr.release.id,
										isrc: primaryEnriched.isrc || `UPC-${upc}`,
										upc,
										fieldName: 'release_date',
										oldValue: pr.release.releaseDate ? currentReleaseDateStr : '',
										newValue: apiReleaseDateStr,
										changeType: 'update',
										enriched: primaryEnriched,
									}),
								);
							}

							// ─── Artist ──────────────────────────────
							if (primaryEnriched.artistName) {
								const hasExactArtist = (pr.release.releaseArtists || []).some(
									(ra) => ra.artist?.name?.trim()?.toLowerCase() === primaryEnriched.artistName?.trim()?.toLowerCase()
								);
								if (!hasExactArtist) {
									if (!dryRun) {
										await this.ensureArtistLink(pr.release, primaryEnriched.artistName);
									}
									changes.push(`Artist: added "${primaryEnriched.artistName}"`);
									chunkChangeLogs.push(
										this.buildLogEntry(scanId, now, dryRun, {
											entityType: 'artist',
											entityId: pr.release.id,
											releaseId: pr.release.id,
											isrc: primaryEnriched.isrc || `UPC-${upc}`,
											upc,
											fieldName: 'artist_name',
											oldValue: (pr.release.releaseArtists || []).map(ra => ra.artist?.name).filter(Boolean).join(', '),
											newValue: primaryEnriched.artistName,
											changeType: 'create',
											enriched: primaryEnriched,
										}),
									);
								}
							}

							// ─── Create/Save Tracks ──────────────────
							if (primaryEnriched.tracks && primaryEnriched.tracks.length > 0) {
								await this.syncReleaseTracks(
									pr.release,
									primaryEnriched.tracks,
									dryRun,
									primaryEnriched,
									now,
									scanId,
									chunkChangeLogs,
									changes,
								);
							}

							if (changes.length > 0) {
								result.enriched++;
								result.metadataUpdated += changes.length;
								this.logger.log(
									`✅ Release ${pr.release.id} (UPC ${upc}): ${changes.join(' | ')} (via ${primaryEnriched.source})`,
								);
								result.details.push({
									isrc: primaryEnriched.isrc || `UPC-${upc}`,
									action: 'upc_metadata_updated',
									source: primaryEnriched.source,
									newUpc: upc,
								});
							}

							pr.resolved = true;
							await this.updateEnrichmentStatus(pr.release.id, ReleaseEnrichmentStatus.SUCCESS, scanId, {
								source: primaryEnriched.source,
								dryRun,
							});
							markReleaseProgress(pr.release.id, 'success');
						} else {
							this.logger.warn(`UPC ${upc} enrichment returned no metadata.`);
						}
					} catch (err) {
						result.errors++;
						chunkFailedReleases.add(pr.release.id);
						this.logger.error(`Failed to update release ${pr.release.id} via UPC: ${err.message}`);
						await this.updateEnrichmentStatus(pr.release.id, ReleaseEnrichmentStatus.FAILED, scanId, {
							errorMessage: err.message,
							dryRun,
						});
						markReleaseProgress(pr.release.id, 'failed');
					}
				}
			}

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
					concurrency: 1,
					delayMs: 500,
					forceExternal: force,
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
												updated_at: now.slice(0, 19),
											}],
										);
									} catch (chErr) {
										this.logger.error(`Failed to insert resolved UPC mapping to ClickHouse: ${chErr.message}`);
									}

									await this.updateEnrichmentStatus(existing.id, ReleaseEnrichmentStatus.SUCCESS, scanId, {
										source: primaryEnriched.source,
										dryRun,
									});

									// Mark resolved and continue
									const pending = pendingReleases.find(pr => pr.release.id === releaseId);
									if (pending) pending.resolved = true;
									markReleaseProgress(releaseId, 'success');
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
											updated_at: now.slice(0, 19),
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

						// ─── Create/Save Tracks ──────────────────
						if (primaryEnriched.tracks && primaryEnriched.tracks.length > 0) {
							await this.syncReleaseTracks(
								release,
								primaryEnriched.tracks,
								dryRun,
								primaryEnriched,
								now,
								scanId,
								chunkChangeLogs,
								changes,
							);
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

						await this.updateEnrichmentStatus(release.id, ReleaseEnrichmentStatus.SUCCESS, scanId, {
							source: primaryEnriched.source,
							dryRun,
						});
						markReleaseProgress(releaseId, 'success');

					} catch (err) {
						result.errors++;
						chunkFailedReleases.add(releaseId);
						this.logger.error(`Failed to update release ${releaseId}: ${err.message}`);
						await this.updateEnrichmentStatus(release.id, ReleaseEnrichmentStatus.FAILED, scanId, {
							errorMessage: err.message,
							dryRun,
						});
						markReleaseProgress(releaseId, 'failed');
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

			// For releases that were NOT enriched (resolved = false), mark as NOT_FOUND
			for (const pr of pendingReleases) {
				if (!pr.resolved && !chunkFailedReleases.has(pr.release.id)) {
					await this.updateEnrichmentStatus(pr.release.id, ReleaseEnrichmentStatus.NOT_FOUND, scanId, {
						dryRun,
					});
					this.logger.log(`⚠️ Release ${pr.release.id} could not be resolved (marked NOT_FOUND)`);
					markReleaseProgress(pr.release.id, 'not_found');
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

			// Update the session progress
			let chunkSuccess = 0;
			let chunkFailed = 0;
			let chunkNotFound = 0;

			for (const pr of pendingReleases) {
				if (pr.resolved) {
					chunkSuccess++;
				} else if (chunkFailedReleases.has(pr.release.id)) {
					chunkFailed++;
				} else {
					chunkNotFound++;
				}
			}

			result.totalScanned += pendingReleases.length;

			session.processedReleases += pendingReleases.length;
			session.successCount += chunkSuccess;
			session.failedCount += chunkFailed;
			session.notFoundCount += chunkNotFound;
			await sessionRepo.save(session);

			this.enrichEventsGateway.emit({
				scanId,
				type: 'progress',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					totalReleases: session.totalReleases,
					processedReleases: session.processedReleases,
					successCount: session.successCount,
					failedCount: session.failedCount,
					notFoundCount: session.notFoundCount,
				},
			});
		}

		session.status = ScanSessionStatus.COMPLETED;
		session.finishedAt = new Date();
		await sessionRepo.save(session);

		this.enrichEventsGateway.emit({
			scanId,
			type: 'completed',
			timestamp: new Date().toISOString(),
			data: {
				status: session.status,
				totalReleases: session.totalReleases,
				processedReleases: session.processedReleases,
				successCount: session.successCount,
				failedCount: session.failedCount,
				notFoundCount: session.notFoundCount,
			},
		});

		this.logger.log(
			`🏁 Scan complete (scanId=${scanId}): ${result.totalScanned} scanned, ` +
				`${result.enriched} enriched, ${result.upcResolved} UPCs resolved, ` +
				`${result.metadataUpdated} fields updated, ${result.changesLogged} logged, ` +
				`${result.errors} errors`,
		);

		return result;
		} catch (err) {
			session.status = ScanSessionStatus.FAILED;
			session.errorMessage = err.message;
			session.finishedAt = new Date();
			await sessionRepo.save(session);

			this.enrichEventsGateway.emit({
				scanId,
				type: 'failed',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					errorMessage: err.message,
				},
			});
			throw err;
		}
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

	/**
	 * Get general statistics summary of enrichment progress
	 */
	async getEnrichmentSummary() {
		const releaseRepo = this.dataSource.getRepository(Release);
		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);

		const totalReleases = await releaseRepo.count({
			where: { isImportedFromReport: true },
		});

		const counts = await enrichmentRepo
			.createQueryBuilder('re')
			.select('re.status', 'status')
			.addSelect('COUNT(re.id)', 'count')
			.groupBy('re.status')
			.getRawMany();

		let successCount = 0;
		let failedCount = 0;
		let notFoundCount = 0;
		let pendingCount = 0;

		for (const row of counts) {
			const countVal = parseInt(row.count, 10) || 0;
			if (row.status === ReleaseEnrichmentStatus.SUCCESS) {
				successCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.FAILED) {
				failedCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.NOT_FOUND) {
				notFoundCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.PENDING) {
				pendingCount = countVal;
			}
		}

		const totalDone = successCount + failedCount + notFoundCount;
		const totalRemaining = Math.max(0, totalReleases - totalDone);

		return {
			totalReleases,
			totalDone,
			totalRemaining,
			successCount,
			failedCount,
			notFoundCount,
			pendingCount,
		};
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

	private async syncReleaseTracks(
		release: Release,
		apiTracks: Array<{ isrc: string; title: string; duration?: number; trackNumber?: number; spotifyId?: string; deezerId?: string }>,
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
		const dbTracks = await trackRepo.find({
			where: { releaseId: release.id },
		});

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
				if (!dryRun) {
					await trackRepo.update(
						{ id: existingTrack.id },
						{
							title: apiTrack.title,
							order: targetOrder,
						}
					);
				}
				
				const hasChanges = existingTrack.title !== apiTrack.title || existingTrack.order !== targetOrder;
				if (hasChanges) {
					changes.push(`Track[${apiTrack.isrc}] updated: "${apiTrack.title}" (order: ${targetOrder})`);
				}
			} else {
				// Create new track
				let newTrack: Track | undefined;
				if (!dryRun) {
					newTrack = await trackRepo.save(
						trackRepo.create({
							releaseId: release.id,
							isrc: apiTrack.isrc,
							title: apiTrack.title,
							order: targetOrder,
							isImportedFromReport: true,
						})
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

	private async updateEnrichmentStatus(
		releaseId: string,
		status: ReleaseEnrichmentStatus,
		scanId: string,
		options?: {
			source?: string;
			errorMessage?: string;
			dryRun?: boolean;
		},
	): Promise<void> {
		const dryRun = options?.dryRun ?? false;
		if (dryRun) return;

		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		let enrichment = await enrichmentRepo.findOne({ where: { releaseId } });

		if (!enrichment) {
			enrichment = enrichmentRepo.create({ releaseId });
		}

		enrichment.status = status;
		enrichment.lastScannedAt = new Date();
		enrichment.lastScanId = scanId;
		enrichment.enrichmentSource = options?.source || null;
		enrichment.errorMessage = options?.errorMessage || null;

		await enrichmentRepo.save(enrichment);
	}

	/**
	 * List recent metadata scan sessions
	 */
	async listScanSessions(query: {
		page?: number;
		pageSize?: number;
	}): Promise<{ items: MetadataScanSession[]; totalItems: number }> {
		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 10;

		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const [items, totalItems] = await sessionRepo.findAndCount({
			order: { createdAt: 'DESC' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		});

		return {
			items,
			totalItems,
		};
	}

	/**
	 * Find a metadata scan session by ID
	 */
	async findScanSessionById(id: string): Promise<MetadataScanSession | null> {
		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		return sessionRepo.findOne({ where: { id } });
	}
}
