import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfigService } from '../../../app-config/app-config.service';
import { IsrcService } from '../../../external/isrc/isrc.service';
import { UpcService } from '../../../external/upc/upc.service';
import { IdentifierProvisioner } from '../../domain/ports/identifier-provisioner.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { Isrc } from '../../domain/value-objects/isrc.vo';
import { Upc } from '../../domain/value-objects/upc.vo';
import { ReleaseSnapshotOrmEntity } from '../persistence/release-snapshot.orm-entity';
import { withTimeout } from '../resilience/with-timeout';
import { ReleaseSnapshotPayload } from './ddex-data-mapper';

/**
 * GrpcIdentifierAdapter — provisions UPC/ISRC via gRPC microservices.
 *
 * Wraps v3 UpcService.getUpc() and IsrcService.create() behind the
 * IdentifierProvisioner domain port. Both gRPC calls are idempotent
 * by design (get-or-create pattern).
 *
 * Config source: AppConfigService.cache.config.generator
 *   - prefixUpcDefaultId  → UPC prefix ID
 *   - prefixIsrcDefaultId → ISRC prefix ID
 */
@Injectable()
export class GrpcIdentifierAdapter implements IdentifierProvisioner {
	private readonly logger = new Logger(GrpcIdentifierAdapter.name);

	// Khối D: deadline tường minh ở tầng adapter. UpcService/IsrcService đã có timeout(10s) ở
	// rxjs, nhưng bọc withTimeout thêm ở đây làm backstop (phòng khi service layer đổi) + phủ
	// cả các call phụ. Bước treo → TimeoutError → BullMQ retry (transient). 15s > 10s service-level
	// để timeout gRPC bắn trước (message rõ hơn), adapter chỉ bắt khi service treo bất thường.
	private static readonly GRPC_TIMEOUT_MS = 15_000;

	constructor(
		private readonly upcService: UpcService,
		private readonly isrcService: IsrcService,
		private readonly appConfigService: AppConfigService,
		@InjectRepository(ReleaseSnapshotOrmEntity)
		private readonly snapshotRepo: Repository<ReleaseSnapshotOrmEntity>,
	) {}

	async provisionUpc(input: {
		releaseId: string;
		key: IdempotencyKey;
	}): Promise<Upc> {
		const prefixUpcId =
			this.appConfigService.cache.config.generator.prefixUpcDefaultId;

		if (!prefixUpcId) {
			throw new Error(
				'GrpcIdentifierAdapter: prefixUpcDefaultId not configured in AppConfig',
			);
		}

		this.logger.log(
			`[provisionUpc] releaseId=${input.releaseId} prefixUpcId=${prefixUpcId}`,
		);

		const res = await withTimeout(
			this.upcService.getUpc({ prefixUpcId }),
			GrpcIdentifierAdapter.GRPC_TIMEOUT_MS,
			`gRPC getUpc prefix=${prefixUpcId}`,
		);

		if (!res?.upc) {
			throw new Error(
				'GrpcIdentifierAdapter: UPC service returned empty GTIN',
			);
		}

		return Upc.create(res.upc);
	}

	async provisionIsrcs(input: {
		trackIds: string[];
		releaseId: string;
		key: IdempotencyKey;
	}): Promise<Map<string, Isrc>> {
		const prefixIsrcId =
			this.appConfigService.cache.config.generator.prefixIsrcDefaultId;

		if (!prefixIsrcId) {
			throw new Error(
				'GrpcIdentifierAdapter: prefixIsrcDefaultId not configured in AppConfig',
			);
		}

		// Load snapshot to get track metadata for ISRC payload
		const snapshot = await this.snapshotRepo.findOne({
			where: { releaseId: input.releaseId },
		});
		if (!snapshot) {
			throw new Error(
				`GrpcIdentifierAdapter: snapshot not found for release ${input.releaseId}`,
			);
		}
		const payload = snapshot.payload as unknown as ReleaseSnapshotPayload;

		const result = new Map<string, Isrc>();

		for (const trackId of input.trackIds) {
			const track = this.findTrackInSnapshot(payload, trackId);

			const isrcPayload = this.buildIsrcPayload(
				track,
				payload,
				prefixIsrcId,
			);

			this.logger.log(
				`[provisionIsrcs] trackId=${trackId} title=${track?.title}`,
			);

			const res = await withTimeout(
				this.isrcService.create(isrcPayload),
				GrpcIdentifierAdapter.GRPC_TIMEOUT_MS,
				`gRPC createIsrc track=${trackId}`,
			);

			if (!res?.data?.code) {
				throw new Error(
					`GrpcIdentifierAdapter: ISRC service returned empty code for track ${trackId}`,
				);
			}

			result.set(trackId, Isrc.create(res.data.code));
		}

		return result;
	}

	/**
	 * Find track in snapshot by ID or by order index.
	 * Snapshot tracks may not have a direct "id" field — match by array index
	 * when trackIds are ordered indices, or by isrc/title as fallback.
	 */
	private findTrackInSnapshot(
		payload: ReleaseSnapshotPayload,
		trackId: string,
	): NonNullable<ReleaseSnapshotPayload['tracks']>[number] | undefined {
		const tracks = payload.tracks ?? [];

		// Try direct ID match (if snapshot stores track IDs)
		const byId = tracks.find((t) => (t as any).id === trackId);
		if (byId) return byId;

		// Fallback: treat trackId as index (0-based)
		const index = parseInt(trackId, 10);
		if (!isNaN(index) && index >= 0 && index < tracks.length) {
			return tracks[index];
		}

		// Last resort: return first track (should not happen in production)
		this.logger.warn(
			`[findTrackInSnapshot] Could not match trackId=${trackId}, using first track`,
		);
		return tracks[0];
	}

	/**
	 * Build ISRC creation payload from track metadata.
	 * Follows v3 logic in track.service.ts:196-318.
	 */
	private buildIsrcPayload(
		track:
			| NonNullable<ReleaseSnapshotPayload['tracks']>[number]
			| undefined,
		release: ReleaseSnapshotPayload,
		prefixIsrcId: string,
	) {
		const mainArtistName =
			track?.trackArtists?.[0]?.artist?.name ?? 'Unknown Artist';
		const registrantName = release.label?.name ?? 'Unknown';
		const versionTitle = track?.version?.trim()
			? track.version
			: 'Original Version';

		const explicit =
			(track?.trackSensitive?.code ?? '').toString().toUpperCase() ===
			'EXPLICIT';

		const yearOfProduction =
			track?.pLineYear ?? new Date().getUTCFullYear();
		const duration = track?.audioFile?.duration ?? 0;

		return {
			registrantName,
			recordingArtist: mainArtistName,
			recordingTitle: track?.title ?? 'Untitled',
			versionTitle,
			assetType: 'AUDIO',
			immersive: false,
			explicit,
			yearOfProduction,
			duration,
			isAdded: false,
			prefixIsrcId,
		};
	}
}
