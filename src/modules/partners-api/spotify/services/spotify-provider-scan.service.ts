import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { SpotifySonarDelivery } from '../entities/spotify-sonar-delivery.entity';
import { SpotifyCatalog } from '../entities/spotify-catalog.entity';
import { SpotifyCatalogAvailability } from '../entities/spotify-catalog-availability.entity';
import { SpotifyCatalogDelivery } from '../entities/spotify-catalog-delivery.entity';
import {
	SpotifySonarScanSession,
	SonarScanSessionStatus,
	SonarScanTriggerType,
} from '../entities/spotify-sonar-scan-session.entity';
import { SpotifyProviderApiService } from './spotify-provider-api.service';
import { SonarEventsGateway } from './sonar-events.gateway';

export interface SonarScanOptions {
	scanId?: string;
	limit?: number;
	isImportedFromReport?: boolean;
	force?: boolean;
	triggerType?: SonarScanTriggerType;
	scheduleId?: string;
}

@Injectable()
export class SpotifyProviderScanService {
	private readonly logger = new Logger(SpotifyProviderScanService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(SpotifySonarDelivery)
		private readonly sonarDeliveryRepo: Repository<SpotifySonarDelivery>,

		@InjectRepository(SpotifyCatalog)
		private readonly catalogRepo: Repository<SpotifyCatalog>,

		@InjectRepository(SpotifyCatalogAvailability)
		private readonly availabilityRepo: Repository<SpotifyCatalogAvailability>,

		@InjectRepository(SpotifyCatalogDelivery)
		private readonly catalogDeliveryRepo: Repository<SpotifyCatalogDelivery>,

		@InjectRepository(SpotifySonarScanSession)
		private readonly sessionRepo: Repository<SpotifySonarScanSession>,

		private readonly apiService: SpotifyProviderApiService,
		private readonly sonarEvents: SonarEventsGateway,
	) {}

	async getDeliveriesByRelease(releaseId: string): Promise<SpotifySonarDelivery[]> {
		return this.sonarDeliveryRepo.find({
			where: { releaseId },
			order: { createdAtSpotify: 'DESC' },
		});
	}

	async createSession(opts: {
		force: boolean;
		limitCount: number | null;
		isImportedFromReport: boolean | null;
		triggerType?: SonarScanTriggerType;
		scheduleId?: string;
	}): Promise<{ scanId: string }> {
		const session = this.sessionRepo.create({
			status: SonarScanSessionStatus.PROCESSING,
			force: opts.force,
			limitCount: opts.limitCount,
			isImportedFromReport: opts.isImportedFromReport,
			triggerType: opts.triggerType ?? SonarScanTriggerType.MANUAL,
			scheduleId: opts.scheduleId ?? null,
			startedAt: new Date(),
		});
		await this.sessionRepo.save(session);
		return { scanId: session.id };
	}

	async findSessionById(scanId: string): Promise<SpotifySonarScanSession | null> {
		return this.sessionRepo.findOne({ where: { id: scanId } });
	}

	async listSessions(limit: number): Promise<SpotifySonarScanSession[]> {
		return this.sessionRepo.find({
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}

	async scanAll(options: SonarScanOptions = {}): Promise<{ scanId: string; processed: number; failed: number }> {
		const {
			scanId: existingScanId,
			limit,
			isImportedFromReport,
			force = false,
			triggerType = SonarScanTriggerType.MANUAL,
			scheduleId,
		} = options;

		// Reuse existing session created by controller, or create a new one (e.g. cron)
		let session: SpotifySonarScanSession;
		if (existingScanId) {
			session = await this.sessionRepo.findOneOrFail({ where: { id: existingScanId } });
		} else {
			session = this.sessionRepo.create({
				status: SonarScanSessionStatus.PROCESSING,
				force,
				triggerType,
				scheduleId: scheduleId ?? null,
				isImportedFromReport: isImportedFromReport ?? null,
				limitCount: limit ?? null,
				startedAt: new Date(),
			});
			await this.sessionRepo.save(session);
		}
		const scanId = session.id;

		const emitProgress = () => {
			this.sonarEvents.emit({
				scanId,
				type: 'progress',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					totalReleases: session.totalReleases,
					processedReleases: session.processedReleases,
					successCount: session.successCount,
					failedCount: session.failedCount,
				},
			});
		};

		try {
			const where: Record<string, unknown> = { upc: Not(IsNull()) };
			if (isImportedFromReport !== undefined) {
				where['isImportedFromReport'] = isImportedFromReport;
			}

			const releases = await this.releaseRepo.find({
				where,
				select: ['id', 'upc', 'isImportedFromReport'],
				take: limit ?? 500,
				order: { createdAt: 'DESC' },
			});

			let releaseList = releases;

			if (!force) {
				const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
				const recentlyScanned = await this.sonarDeliveryRepo
					.createQueryBuilder('sd')
					.select('sd.release_id', 'releaseId')
					.where('sd.updated_at > :oneDayAgo', { oneDayAgo })
					.groupBy('sd.release_id')
					.getRawMany<{ releaseId: string }>();

				const scannedIds = new Set(recentlyScanned.map((r) => r.releaseId));
				releaseList = releases.filter((r) => !scannedIds.has(r.id));
			}

			session.totalReleases = releaseList.length;
			await this.sessionRepo.save(session);

			this.logger.log(`[${scanId}] Scanning ${releaseList.length} releases (force=${force})`);
			emitProgress();

			for (const release of releaseList) {
				try {
					await this.scanRelease(release);
					session.successCount++;
				} catch (err) {
					session.failedCount++;
					this.logger.error(
						`[${scanId}] Failed release ${release.id} (UPC: ${release.upc}): ${(err as Error).message}`,
						(err as Error).stack,
					);
				}

				session.processedReleases++;
				await this.sessionRepo.save(session);
				emitProgress();

				await new Promise((resolve) => setTimeout(resolve, 200));
			}

			session.status = SonarScanSessionStatus.COMPLETED;
			session.finishedAt = new Date();
			await this.sessionRepo.save(session);

			this.logger.log(`[${scanId}] Scan complete: ${session.successCount} ok, ${session.failedCount} failed`);

			this.sonarEvents.emit({
				scanId,
				type: 'completed',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					totalReleases: session.totalReleases,
					processedReleases: session.processedReleases,
					successCount: session.successCount,
					failedCount: session.failedCount,
				},
			});

			return { scanId, processed: session.successCount, failed: session.failedCount };
		} catch (err) {
			session.status = SonarScanSessionStatus.FAILED;
			session.finishedAt = new Date();
			session.errorMessage = (err as Error).message;
			await this.sessionRepo.save(session);

			this.sonarEvents.emit({
				scanId,
				type: 'failed',
				timestamp: new Date().toISOString(),
				data: {
					status: session.status,
					totalReleases: session.totalReleases,
					processedReleases: session.processedReleases,
					successCount: session.successCount,
					failedCount: session.failedCount,
					errorMessage: session.errorMessage,
				},
			});

			throw err;
		}
	}

	async scanRelease(release: Pick<Release, 'id' | 'upc'>): Promise<void> {
		if (!release.upc) return;

		const productStatuses = await this.apiService.getDeliveries(release.upc);

		if (!productStatuses.length) {
			this.logger.debug(`No deliveries found for release ${release.id} (UPC: ${release.upc})`);
			return;
		}

		let firstAlbumUri: string | null = null;

		for (const ps of productStatuses) {
			const detail = await this.apiService.getDeliveryDetail(
				ps.key.productId,
				ps.key.deliveryName,
				ps.key.feedGid,
			);

			const validationErrors = detail?.productDetail?.validationStatus?.errors ?? null;

			const coverArtSha1 = ps.albumMetadata?.coverArt
				? {
					small: ps.albumMetadata.coverArt.smallCoverArt?.sha1digest ?? null,
					medium: ps.albumMetadata.coverArt.mediumCoverArt?.sha1digest ?? null,
					large: ps.albumMetadata.coverArt.largeCoverArt?.sha1digest ?? null,
				  }
				: null;

			const earliestStartDate = ps.albumMetadata?.earliestStartDate?.startDate
				? new Date(ps.albumMetadata.earliestStartDate.startDate)
				: null;

			await this.sonarDeliveryRepo
				.createQueryBuilder()
				.insert()
				.into(SpotifySonarDelivery)
				.values({
					releaseId: release.id,
					spotifyId: ps.id,
					feedGid: ps.key.feedGid,
					deliveryName: ps.key.deliveryName,
					productId: ps.key.productId,
					status: ps.status,
					createdAtSpotify: ps.createdAt ? new Date(ps.createdAt) : null,
					updatedAtSpotify: ps.updatedAt ? new Date(ps.updatedAt) : null,
					licensorUuid: ps.licensorUuid ?? null,
					licensorName: ps.licensorName ?? null,
					feedName: ps.feedName ?? null,
					albumUri: ps.uri ?? null,
					artistNames: (ps.albumMetadata?.artistName ?? null) as string[] | null,
					albumName: ps.albumMetadata?.albumName ?? null,
					coverArtSha1: coverArtSha1 as Record<string, string> | null,
					earliestStartDate,
					validationErrors: validationErrors?.length ? validationErrors : null,
					isProviderTest: ps.isProviderTest ?? false,
					warningStatus: ps.warningStatus ?? null,
					warningCount: ps.warningCount ?? 0,
				})
				.orUpdate(
					[
						'status', 'updated_at_spotify', 'validation_errors',
						'warning_status', 'warning_count', 'album_uri',
						'artist_names', 'album_name', 'cover_art_sha1',
						'earliest_start_date', 'licensor_uuid', 'licensor_name',
						'feed_name', 'is_provider_test', 'spotify_id',
					],
					['release_id', 'delivery_name', 'feed_gid'],
				)
				.execute();

			if (!firstAlbumUri && ps.uri) {
				firstAlbumUri = ps.uri;
			}
		}

		if (firstAlbumUri) {
			await this.syncCatalog(release.id, firstAlbumUri);
		}
	}

	private async syncCatalog(releaseId: string, albumUri: string): Promise<void> {
		const catalog = await this.apiService.getCatalog(albumUri);
		if (!catalog?.effectiveData) return;

		const { effectiveData, availability, deliveries } = catalog;

		const resolvedAlbumUri = effectiveData.uri || albumUri;
		const resolvedAlbumUrl = effectiveData.url || null;
		// Extract bare albumId from "spotify:album:<id>"
		const albumId = resolvedAlbumUri.startsWith('spotify:album:')
			? resolvedAlbumUri.replace('spotify:album:', '')
			: null;

		const savedCatalog = await this.catalogRepo
			.createQueryBuilder()
			.insert()
			.into(SpotifyCatalog)
			.values({
				releaseId,
				albumUri: resolvedAlbumUri,
				albumUrl: resolvedAlbumUrl,
				artists: effectiveData.artists?.length ? effectiveData.artists : null,
				syncedAt: new Date(),
			})
			.orUpdate(
				['album_uri', 'album_url', 'artists', 'synced_at'],
				['release_id'],
			)
			.returning(['id'])
			.execute();

		// Update releases.metadata_spotify with albumId + albumUrl
		await this.releaseRepo
			.createQueryBuilder()
			.update()
			.set({
				metadataSpotify: () =>
					`COALESCE(metadata_spotify, '{}')::jsonb || '${JSON.stringify({
						albumId,
						albumUrl: resolvedAlbumUrl,
						lastSyncedAt: new Date().toISOString(),
					})}'::jsonb`,
			})
			.where('id = :releaseId', { releaseId })
			.execute();

		const catalogId: string | undefined =
			savedCatalog.generatedMaps?.[0]?.id
			?? (await this.catalogRepo.findOne({ where: { releaseId }, select: ['id'] }))?.id;

		if (!catalogId) return;

		if (deliveries?.length) {
			const deliveryRows = deliveries.map((d) => ({
				catalogId,
				deliveryId: d.deliveryId,
				action: d.action || null,
				deliveredAt: d.deliveredAt || null,
				feedName: d.feedName || null,
				productId: d.productId || null,
				source: d.source || null,
				feedGid: d.feedGid || null,
				deliveryStatus: d.deliveryStatus || null,
				deliveryErrors: (d.deliveryErrors?.length ? d.deliveryErrors : null) as string[] | null,
				deliveryErrorsAndTypes: d.deliveryErrorsAndTypes?.length ? d.deliveryErrorsAndTypes : null,
				assetTranscodingStatuses: d.assetTranscodingStatuses?.length ? d.assetTranscodingStatuses : null,
			}));

			await this.catalogDeliveryRepo
				.createQueryBuilder()
				.insert()
				.into(SpotifyCatalogDelivery)
				.values(deliveryRows)
				.orUpdate(
					[
						'action', 'delivered_at', 'feed_name', 'product_id', 'source',
						'feed_gid', 'delivery_status', 'delivery_errors',
						'delivery_errors_and_types', 'asset_transcoding_statuses',
					],
					['catalog_id', 'delivery_id'],
				)
				.execute();
		}

		if (!availability) return;

		const availabilityEntries = Object.entries(availability).map(([countryCode, avail]) => ({
			catalogId,
			countryCode,
			deliveredStart: avail.deliveredStart || null,
			deliveredEnd: avail.deliveredEnd || null,
			effectiveStart: avail.effectiveStart || null,
			effectiveEnd: avail.effectiveEnd || null,
			status: avail.status || null,
		}));

		if (!availabilityEntries.length) return;

		const chunkSize = 100;
		for (let i = 0; i < availabilityEntries.length; i += chunkSize) {
			const chunk = availabilityEntries.slice(i, i + chunkSize);
			await this.availabilityRepo
				.createQueryBuilder()
				.insert()
				.into(SpotifyCatalogAvailability)
				.values(chunk)
				.orUpdate(
					['delivered_start', 'delivered_end', 'effective_start', 'effective_end', 'status'],
					['catalog_id', 'country_code'],
				)
				.execute();
		}
	}
}
