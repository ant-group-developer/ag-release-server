import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager, FindOptionsWhere, Like, ILike, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { TrackScanHistory } from 'src/modules/copyright/entities/track-scan-history.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
import { TrackRevenue } from 'src/modules/track-revenue/entities/track-revenue.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { MetadataEnrichmentService, EnrichedMetadata } from './metadata-enrichment.service';
import { ReleaseEnrichment, ReleaseEnrichmentStatus } from 'src/modules/release/entities/release-enrichment.entity';
import {
	MetadataScanSession,
	MetadataScanTriggerType,
	ScanSessionStatus,
} from 'src/modules/release/entities/metadata-scan-session.entity';
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
export class MetadataScanService implements OnModuleInit {
	private readonly logger = new Logger(MetadataScanService.name);

	constructor(
		private readonly dataSource: DataSource,
		private readonly metadataEnrichmentService: MetadataEnrichmentService,
		private readonly clickHouseService: ClickHouseService,
		private readonly enrichEventsGateway: EnrichEventsGateway,
	) {}

	async onModuleInit(): Promise<void> {
		await this.failInterruptedProcessingScans();
	}

	private async failInterruptedProcessingScans(): Promise<void> {
		const errorMessage = 'Scan interrupted because the server restarted while it was processing.';
		const now = new Date();
		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);

		const processingSessions = await sessionRepo.find({
			where: { status: ScanSessionStatus.PROCESSING },
		});

		for (const session of processingSessions) {
			const remaining = Math.max(
				0,
				(session.totalReleases || 0) - (session.processedReleases || 0),
			);

			session.status = ScanSessionStatus.FAILED;
			session.errorMessage = errorMessage;
			session.failedCount = (session.failedCount || 0) + remaining;
			session.processedReleases = session.totalReleases || session.processedReleases || 0;
			session.finishedAt = now;
		}

		if (processingSessions.length > 0) {
			await sessionRepo.save(processingSessions);
		}

		const updateResult = await enrichmentRepo.update(
			{ status: ReleaseEnrichmentStatus.PROCESSING },
			{
				status: ReleaseEnrichmentStatus.FAILED,
				errorMessage,
				lastScannedAt: now,
			},
		);

		if (processingSessions.length > 0 || (updateResult.affected || 0) > 0) {
			this.logger.warn(
				`Marked ${processingSessions.length} interrupted scan session(s) and ${updateResult.affected || 0} processing release enrichment(s) as FAILED.`,
			);
		}
	}

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
		isImportedFromReport?: boolean;
		triggerType?: MetadataScanTriggerType;
		scheduleId?: string;
	}): Promise<ScanResult> {
		const limit = options?.limit;
		const dryRun = options?.dryRun ?? false;
		const scanId = options?.scanId ?? uuidv4();
		const force = options?.force ?? false;
		const isImportedFromReport = options?.isImportedFromReport ?? true;
		const triggerType = options?.triggerType ?? MetadataScanTriggerType.MANUAL;
		const scheduleId = options?.scheduleId ?? null;
		const excludedStatuses = force
			? [ReleaseEnrichmentStatus.PROCESSING]
			: [
					ReleaseEnrichmentStatus.PROCESSING,
					ReleaseEnrichmentStatus.SUCCESS,
					ReleaseEnrichmentStatus.NOT_FOUND,
				];

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
			triggerType,
			scheduleId,
			isImportedFromReport,
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

		// Find releases eligible for metadata/link enrichment.
		const queryBuilder = releaseRepo.createQueryBuilder('release')
			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('release.releaseArtists', 'releaseArtist')
			.leftJoinAndSelect('releaseArtist.artist', 'artist')
			.leftJoin(
				ReleaseEnrichment,
				'releaseEnrichmentFilter',
				'releaseEnrichmentFilter.releaseId = release.id AND releaseEnrichmentFilter.status IN (:...excludedStatuses)',
				{ excludedStatuses },
			)
			.andWhere('releaseEnrichmentFilter.id IS NULL');

		if (isImportedFromReport !== undefined) {
			queryBuilder.andWhere(
				'release.isImportedFromReport = :isImportedFromReport',
				{ isImportedFromReport },
			);
		}

		queryBuilder.orderBy('release.createdAt', 'DESC');

		if (limit !== undefined) {
			queryBuilder.take(limit);
		}
		const allReleases = dryRun
			? await queryBuilder.getMany()
			: await this.findAndReserveReleasesForScan(
					limit,
					scanId,
					excludedStatuses,
					isImportedFromReport,
				);

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

							await this.syncExternalMetadataJson(
								pr.release,
								primaryEnriched,
								dryRun,
								now,
								scanId,
								chunkChangeLogs,
								changes,
							);

							if (!pr.release.isImportedFromReport) {
								if (changes.length > 0) {
									result.enriched++;
									result.metadataUpdated += changes.length;
									this.logger.log(
										`Release ${pr.release.id} links updated: ${changes.join(' | ')} (via ${primaryEnriched.source})`,
									);
								}

								pr.resolved = true;
								await this.updateEnrichmentStatus(pr.release.id, ReleaseEnrichmentStatus.SUCCESS, scanId, {
									source: primaryEnriched.source,
									dryRun,
								});
								markReleaseProgress(pr.release.id, 'success');
								continue;
							}

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

						await this.syncExternalMetadataJson(
							release,
							primaryEnriched,
							dryRun,
							now,
							scanId,
							chunkChangeLogs,
							changes,
						);

						if (!release.isImportedFromReport) {
							if (changes.length > 0) {
								result.enriched++;
								result.metadataUpdated += changes.length;
								this.logger.log(
									`Release ${releaseId} links updated: ${changes.join(' | ')} (via ${primaryEnriched.source})`,
								);
							}

							const pending = pendingReleases.find(pr => pr.release.id === releaseId);
							if (pending) pending.resolved = true;

							await this.updateEnrichmentStatus(release.id, ReleaseEnrichmentStatus.SUCCESS, scanId, {
								source: primaryEnriched.source,
								dryRun,
							});
							markReleaseProgress(releaseId, 'success');
							continue;
						}

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

											// 1. Relink tracks, or merge when the target UPC already has the same ISRC.
											const targetTracks = await trackRepoTx.find({
												where: { releaseId: existing.id },
												order: { order: 'DESC' },
											});
											const maxOrder = targetTracks.length > 0 ? (targetTracks[0].order ?? 0) : 0;
											const targetTrackByIsrc = new Map<string, Track>();
											for (const targetTrack of targetTracks) {
												const normalizedIsrc = targetTrack.isrc?.trim().toUpperCase();
												if (normalizedIsrc) {
													targetTrackByIsrc.set(normalizedIsrc, targetTrack);
												}
											}

											const duplicateTracks = await trackRepoTx.find({
												where: { releaseId: release.id },
												order: { order: 'ASC' },
											});

											let currentOrder = maxOrder + 1;
											for (const track of duplicateTracks) {
												const normalizedIsrc = track.isrc?.trim().toUpperCase();
												const targetTrack = normalizedIsrc
													? targetTrackByIsrc.get(normalizedIsrc)
													: null;

												if (targetTrack) {
													await this.mergeDuplicateTrackRowsWithManager(
														manager,
														targetTrack.id,
														[track.id],
													);

													changes.push(
														`Track[${track.isrc}] already exists on target release ${existing.id}; merged duplicate track ${track.id} into ${targetTrack.id}`,
													);
													chunkChangeLogs.push(
														this.buildLogEntry(scanId, now, dryRun, {
															entityType: 'track',
															entityId: track.id,
															releaseId: existing.id,
															isrc: track.isrc || '',
															upc: apiUpc,
															fieldName: 'duplicate_isrc_target_upc_merge',
															oldValue: release.id,
															newValue: targetTrack.id,
															changeType: 'merge',
															enriched: this.buildLogMetadataForTrack(
																track.isrc || '',
																primaryEnriched.tracks?.find(
																	(apiTrack) =>
																		apiTrack.isrc?.trim().toUpperCase() === normalizedIsrc,
																),
															),
														}),
													);
													continue;
												}

												await trackRepoTx.update(
													{ id: track.id },
													{
														releaseId: existing.id,
														order: currentOrder++,
													},
												);
												if (normalizedIsrc) {
													track.releaseId = existing.id;
													targetTrackByIsrc.set(normalizedIsrc, track);
												}
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

									result.enriched++;
									result.metadataUpdated += changes.length;
									this.logger.log(
										`✅ Release ${releaseId}: ${changes.join(' | ')} (via ${primaryEnriched.source})`,
									);

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
			await this.markProcessingReleasesFailed(scanId, err.message, dryRun);
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

		const totalReleases = await releaseRepo.count();

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
		let processingCount = 0;

		for (const row of counts) {
			const countVal = parseInt(row.count, 10) || 0;
			if (row.status === ReleaseEnrichmentStatus.SUCCESS) {
				successCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.FAILED) {
				failedCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.NOT_FOUND) {
				notFoundCount = countVal;
			} else if (row.status === ReleaseEnrichmentStatus.PROCESSING) {
				processingCount = countVal;
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
			processingCount,
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

	private async syncExternalMetadataJson(
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

	private async mergeDuplicateTrackRowsWithManager(
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

	private buildLogMetadataForTrack(
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

	private async syncReleaseTracks(
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

	private async findAndReserveReleasesForScan(
		limit: number | undefined,
		scanId: string,
		excludedStatuses: ReleaseEnrichmentStatus[],
		isImportedFromReport?: boolean,
	): Promise<Release[]> {
		const params: unknown[] = [
			excludedStatuses,
			scanId,
			isImportedFromReport ?? null,
		];
		const limitClause = limit !== undefined ? 'LIMIT $4' : '';
		if (limit !== undefined) {
			params.push(limit);
		}

		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		// Raw SQL is intentional here: the reservation must be atomic with
		// FOR UPDATE SKIP LOCKED + ON CONFLICT + RETURNING to avoid duplicate scans.
		const rows: Array<{ release_id: string }> = await enrichmentRepo.query(
			`
				WITH candidates AS (
					SELECT "release"."id"
					FROM "releases" "release"
					WHERE NOT EXISTS (
							SELECT 1
							FROM "release_enrichments" "re"
							WHERE "re"."release_id" = "release"."id"
								AND "re"."status" = ANY($1::varchar[])
						)
						AND ($3::boolean IS NULL OR "release"."is_imported_from_report" = $3::boolean)
					ORDER BY "release"."created_at" DESC
					${limitClause}
					FOR UPDATE SKIP LOCKED
				)
				INSERT INTO "release_enrichments" (
					"release_id",
					"status",
					"last_scanned_at",
					"last_scan_id",
					"error_message",
					"enrichment_source"
				)
				SELECT
					"id",
					'PROCESSING',
					now(),
					$2,
					NULL,
					NULL
				FROM candidates
				ON CONFLICT ("release_id") DO UPDATE SET
					"status" = EXCLUDED."status",
					"last_scanned_at" = EXCLUDED."last_scanned_at",
					"last_scan_id" = EXCLUDED."last_scan_id",
					"error_message" = NULL,
					"enrichment_source" = NULL,
					"updated_at" = now()
				RETURNING "release_id"
			`,
			params,
		);

		const releaseIds = rows.map((row) => row.release_id);
		if (releaseIds.length === 0) return [];

		return this.dataSource
			.getRepository(Release)
			.createQueryBuilder('release')
			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('release.releaseArtists', 'releaseArtist')
			.leftJoinAndSelect('releaseArtist.artist', 'artist')
			.where('release.id IN (:...releaseIds)', { releaseIds })
			.orderBy('release.createdAt', 'DESC')
			.getMany();
	}

	private async markProcessingReleasesFailed(
		scanId: string,
		errorMessage: string,
		dryRun: boolean,
	): Promise<void> {
		if (dryRun) return;

		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		await enrichmentRepo.update(
			{
				lastScanId: scanId,
				status: ReleaseEnrichmentStatus.PROCESSING,
			},
			{
				status: ReleaseEnrichmentStatus.FAILED,
				errorMessage,
				lastScannedAt: new Date(),
			},
		);
	}

	/**
	 * List recent metadata scan sessions
	 */
	async listScanSessions(query: {
		page?: number;
		pageSize?: number;
		scheduleId?: string;
		triggerType?: MetadataScanTriggerType;
		isImportedFromReport?: boolean;
		status?: ScanSessionStatus;
	}): Promise<{ items: MetadataScanSession[]; totalItems: number }> {
		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 10;
		const where: FindOptionsWhere<MetadataScanSession> = {};
		if (query.scheduleId) where.scheduleId = query.scheduleId;
		if (query.triggerType) where.triggerType = query.triggerType;
		if (query.isImportedFromReport !== undefined) {
			where.isImportedFromReport = query.isImportedFromReport;
		}
		if (query.status) where.status = query.status;

		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const [items, totalItems] = await sessionRepo.findAndCount({
			where,
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
