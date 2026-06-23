import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { DataSource, FindOptionsWhere, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Release } from 'src/modules/release/entities/release.entity';

export class ScanCancelledError extends Error {
	constructor(scanId: string) {
		super(`Scan session ${scanId} was cancelled`);
		this.name = ScanCancelledError.name;
	}
}
import { Track } from 'src/modules/track/entities/track.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { MetadataEnrichmentService, EnrichedMetadata } from './metadata-enrichment.service';
import { MetadataSyncService, ChangeLogEntry } from './metadata-sync.service';
import { ReleaseEnrichment, ReleaseEnrichmentStatus } from 'src/modules/release/entities/release-enrichment.entity';
import {
	MetadataScanSession,
	MetadataScanTriggerType,
	ScanSessionStatus,
} from 'src/modules/release/entities/metadata-scan-session.entity';
import { EnrichEventsGateway } from './enrich-events.gateway';
import {
	buildEquivalentUpcs,
	isValidStandardUpc,
	normalizeUpc,
} from 'src/utils/upc.util';

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
	private readonly cancelledScanSessions = new Set<string>();

	constructor(
		private readonly dataSource: DataSource,
		private readonly metadataEnrichmentService: MetadataEnrichmentService,
		private readonly metadataSyncService: MetadataSyncService,
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
		scanId?: string;
		force?: boolean;
		isImportedFromReport?: boolean;
		triggerType?: MetadataScanTriggerType;
		scheduleId?: string;
	}): Promise<ScanResult> {
		const limit =
			options?.limit !== undefined && options.limit > 0
				? options.limit
				: undefined;
		const dryRun = false;
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

		let currentPendingReleases: Array<{ release: Release; currentTrackIndex: number; resolved: boolean }> = [];
		let currentChunkFailedReleases = new Set<string>();

		try {

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
				await this.throwIfScanCancelled(scanId);
				const releaseChunk = allReleases.slice(rIndex, rIndex + chunkSize);
				this.logger.log(
					`[Scan Progress] Processing releases ${rIndex + 1} to ${Math.min(
						rIndex + chunkSize,
						allReleases.length,
					)} of ${allReleases.length}...`,
				);

				// We will resolve this chunk of releases.
				const pendingReleases = releaseChunk.map(r => ({
					release: r,
					currentTrackIndex: 0,
					resolved: false,
				}));
				currentPendingReleases = pendingReleases;

				const chunkChangeLogs: ChangeLogEntry[] = [];
				const chunkFailedReleases = new Set<string>();
				currentChunkFailedReleases = chunkFailedReleases;

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
							const releaseExists = await releaseRepo.exist({ where: { id: pr.release.id } });
							if (!releaseExists) {
								pr.resolved = true;
								continue;
							}

							// Throttle to respect API rate limits
							await new Promise((resolve) => setTimeout(resolve, 300));
							const upc = pr.release.upc!.trim();
							this.logger.log(`Querying Spotify/Deezer for UPC ${upc}...`);
							const enriched = await this.metadataEnrichmentService.enrichByUpc(upc, {
								forceExternal: force,
								checkCancelled: () => this.throwIfScanCancelled(scanId),
							});
							if (enriched) {
								const primaryEnriched = enriched;
								const changes: string[] = [];

								await this.metadataSyncService.syncExternalMetadataJson(
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
										this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
										this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
								await this.metadataSyncService.syncReleaseLabelFromEnriched(
									pr.release,
									primaryEnriched,
									dryRun,
									now,
									scanId,
									chunkChangeLogs,
									changes,
									{
										isrc: primaryEnriched.isrc || `UPC-${upc}`,
										upc,
									},
								);

								if (primaryEnriched.artistName) {
									const existingArtists = pr.release.releaseArtists || [];
									const existingNames = existingArtists.map(ra => ra.artist?.name?.trim()).filter(Boolean);
									const isSameArtist = existingNames.length === 1 && existingNames[0].toLowerCase() === primaryEnriched.artistName.trim().toLowerCase();

									if (!isSameArtist) {
										const oldValue = existingNames.join(', ') || 'null';
										if (!dryRun) {
											await this.metadataSyncService.syncReleaseArtistFromEnriched(pr.release, primaryEnriched.artistName);
										}
										changes.push(`Artist: "${oldValue}" -> "${primaryEnriched.artistName}"`);
										chunkChangeLogs.push(
											this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
												entityType: 'artist',
												entityId: pr.release.id,
												releaseId: pr.release.id,
												isrc: primaryEnriched.isrc || `UPC-${upc}`,
												upc,
												fieldName: 'artist_name',
												oldValue,
												newValue: primaryEnriched.artistName,
												changeType: 'update',
												enriched: primaryEnriched,
											}),
										);
									}
								}

								// ─── Create/Save Tracks ──────────────────
								if (primaryEnriched.tracks && primaryEnriched.tracks.length > 0) {
									await this.metadataSyncService.syncReleaseTracks(
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
							this.logger.error(`Failed to update release ${pr.release.id} via UPC due to fatal error: ${err.message}`);
							throw err; // Propagate fatal API/network error to abort scanning
						}
					}
				}

				while (pendingReleases.some(pr => !pr.resolved && pr.currentTrackIndex < (pr.release.tracks?.length ?? 0))) {
					await this.throwIfScanCancelled(scanId);
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
						concurrency: Math.max(1, Math.floor(Number(process.env.METADATA_SCAN_ENRICH_CONCURRENCY) || 1)),
						delayMs: Math.max(0, Math.floor(Number(process.env.METADATA_SCAN_ENRICH_DELAY_MS) || 500)),
						forceExternal: force,
						checkCancelled: () => this.throwIfScanCancelled(scanId),
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
						await this.throwIfScanCancelled(scanId);
						try {
							const releaseExists = await releaseRepo.exist({ where: { id: release.id } });
							if (!releaseExists) {
								this.logger.log(`Release ${release.id} was deleted/merged during this chunk processing. Skipping.`);
								const pending = pendingReleases.find(pr => pr.release.id === releaseId);
								if (pending) pending.resolved = true;
								continue;
							}

							if (enrichedTracks.length === 0) continue;

							const primaryEnriched = enrichedTracks[0].enriched;
							const changes: string[] = [];

							await this.metadataSyncService.syncExternalMetadataJson(
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
							const currentUpc = normalizeUpc(release.upc);
							const apiUpc = normalizeUpc(primaryEnriched.upc);

							const needsUpcUpdate =
								!currentUpc ||
								currentUpc.toUpperCase().startsWith('ISRC-') ||
								(apiUpc && currentUpc !== apiUpc);

							if (needsUpcUpdate && apiUpc) {
								const existing = await releaseRepo.findOne({
									where: { upc: In(buildEquivalentUpcs(apiUpc)) },
								});

								if (existing) {
									if (existing.id !== release.id && !isValidStandardUpc(release.upc)) {
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
														await this.metadataSyncService.mergeDuplicateTrackRowsWithManager(
															manager,
															targetTrack.id,
															[track.id],
														);

														changes.push(
															`Track[${track.isrc}] already exists on target release ${existing.id}; merged duplicate track ${track.id} into ${targetTrack.id}`,
														);
														chunkChangeLogs.push(
															this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
																entityType: 'track',
																entityId: track.id,
																releaseId: existing.id,
																isrc: track.isrc || '',
																upc: apiUpc,
																fieldName: 'duplicate_isrc_target_upc_merge',
																oldValue: release.id,
																newValue: targetTrack.id,
																changeType: 'merge',
																enriched: this.metadataSyncService.buildLogMetadataForTrack(
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
											this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
													release_upc: apiUpc,
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
									} else if (existing.id !== release.id) {
										changes.push(
											`UPC ${apiUpc} already exists on release ${existing.id}; current release ${release.id} has valid UPC ${release.upc}, skipped merge`,
										);
										chunkChangeLogs.push(
											this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
												entityType: 'release',
												entityId: release.id,
												releaseId: release.id,
												isrc: primaryEnriched.isrc,
												upc: release.upc || '',
												fieldName: 'duplicate_valid_upc_skip',
												oldValue: release.upc || '',
												newValue: `Existing release ${existing.id} has UPC ${apiUpc}`,
												changeType: 'skip',
												enriched: primaryEnriched,
											}),
										);
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
										this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
												release_upc: apiUpc,
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
									this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
									this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
							await this.metadataSyncService.syncReleaseLabelFromEnriched(
								release,
								primaryEnriched,
								dryRun,
								now,
								scanId,
								chunkChangeLogs,
								changes,
								{
									isrc: primaryEnriched.isrc,
									upc: release.upc || '',
								},
							);

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
										this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
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
								await this.metadataSyncService.syncReleaseTracks(
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
								const existingArtists = release.releaseArtists || [];
								const existingNames = existingArtists.map(ra => ra.artist?.name?.trim()).filter(Boolean);
								const isSameArtist = existingNames.length === 1 && existingNames[0].toLowerCase() === primaryEnriched.artistName.trim().toLowerCase();

								if (!isSameArtist) {
									const oldValue = existingNames.join(', ') || 'null';
									if (!dryRun) {
										await this.metadataSyncService.syncReleaseArtistFromEnriched(release, primaryEnriched.artistName);
									}
									changes.push(`Artist: "${oldValue}" -> "${primaryEnriched.artistName}"`);

									chunkChangeLogs.push(
										this.metadataSyncService.buildLogEntry(scanId, now, dryRun, {
											entityType: 'artist',
											entityId: release.id,
											releaseId: release.id,
											isrc: primaryEnriched.isrc,
											upc: release.upc || '',
											fieldName: 'artist_name',
											oldValue,
											newValue: primaryEnriched.artistName,
											changeType: 'update',
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

							// Mark this release as successfully resolved
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
					await this.throwIfScanCancelled(scanId);
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

			await this.throwIfScanCancelled(scanId);

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
			if (err instanceof ScanCancelledError) {
				await this.revertProcessingReleasesToPending(scanId);

				let chunkSuccess = 0;
				let chunkFailed = 0;
				let chunkProcessed = 0;
				for (const pr of currentPendingReleases) {
					if (pr.resolved) {
						chunkSuccess++;
						chunkProcessed++;
					} else if (currentChunkFailedReleases.has(pr.release.id)) {
						chunkFailed++;
						chunkProcessed++;
					}
				}

				session.processedReleases += chunkProcessed;
				session.successCount += chunkSuccess;
				session.failedCount += chunkFailed;

				session.status = ScanSessionStatus.CANCELLED;
				session.errorMessage = 'Scan cancelled by user';
				session.finishedAt = new Date();
				await sessionRepo.save(session);

				result.totalScanned = session.processedReleases;
				result.enriched = session.successCount;
				result.errors = session.failedCount;

				this.enrichEventsGateway.emit({
					scanId,
					type: 'cancelled',
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
				this.logger.warn(`Scan session ${scanId} was cancelled by user.`);
				return result;
			}

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
		} finally {
			this.cancelledScanSessions.delete(scanId);
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

		const releaseExists = await this.dataSource.getRepository(Release).exist({ where: { id: releaseId } });
		if (!releaseExists) {
			this.logger.log(`Skipping updateEnrichmentStatus: Release ${releaseId} no longer exists.`);
			return;
		}

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

	private async throwIfScanCancelled(scanId: string): Promise<void> {
		if (this.cancelledScanSessions.has(scanId)) {
			throw new ScanCancelledError(scanId);
		}

		const session = await this.dataSource.getRepository(MetadataScanSession).findOne({
			where: { id: scanId },
			select: ['status'],
		});

		if (session?.status === ScanSessionStatus.CANCELLED) {
			this.cancelledScanSessions.add(scanId);
			throw new ScanCancelledError(scanId);
		}
	}

	private async revertProcessingReleasesToPending(scanId: string): Promise<void> {
		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		await enrichmentRepo.update(
			{
				lastScanId: scanId,
				status: ReleaseEnrichmentStatus.PROCESSING,
			},
			{
				status: ReleaseEnrichmentStatus.PENDING,
				errorMessage: 'Scan cancelled by user',
				lastScannedAt: new Date(),
			},
		);
	}

	async cancelScanSession(scanId: string): Promise<{
		scanId: string;
		status: ScanSessionStatus;
		cancelled: boolean;
	}> {
		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const session = await sessionRepo.findOne({ where: { id: scanId } });
		if (!session) {
			throw new NotFoundException(`Scan session not found: ${scanId}`);
		}

		if (
			session.status === ScanSessionStatus.COMPLETED ||
			session.status === ScanSessionStatus.FAILED ||
			session.status === ScanSessionStatus.CANCELLED
		) {
			return {
				scanId: session.id,
				status: session.status,
				cancelled: session.status === ScanSessionStatus.CANCELLED,
			};
		}

		this.cancelledScanSessions.add(scanId);
		session.status = ScanSessionStatus.CANCELLED;
		session.errorMessage = 'Cancelled by user';
		session.finishedAt = new Date();
		await sessionRepo.save(session);

		await this.revertProcessingReleasesToPending(scanId);

		return {
			scanId: session.id,
			status: session.status,
			cancelled: true,
		};
	}

	async cancelAllScanSessions(): Promise<{
		cancelledCount: number;
		scanIds: string[];
	}> {
		const sessionRepo = this.dataSource.getRepository(MetadataScanSession);
		const activeSessions = await sessionRepo.find({
			where: { status: ScanSessionStatus.PROCESSING },
		});

		const scanIds: string[] = [];
		for (const session of activeSessions) {
			this.cancelledScanSessions.add(session.id);
			session.status = ScanSessionStatus.CANCELLED;
			session.errorMessage = 'Cancelled by user';
			session.finishedAt = new Date();
			await sessionRepo.save(session);

			await this.revertProcessingReleasesToPending(session.id);
			scanIds.push(session.id);
		}

		return {
			cancelledCount: scanIds.length,
			scanIds,
		};
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
