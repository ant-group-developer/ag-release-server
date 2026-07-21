import { Inject, Injectable } from '@nestjs/common';

import { TicketService } from '../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';
import {
	FlagValidationErrorsCommand,
	MarkValidatedCommand,
} from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import {
	RELEASE_SNAPSHOT_READER,
	ReleaseSnapshotReader,
} from '../ports/release-snapshot-reader.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { JobPayload } from '../ports/workflow-engine.port';
import { TICKET_SERVICE } from './../../infrastructure/adapters/postgres-ticket.adapter';

/**
 * ValidateRunner — consumer của `dist.validate`.
 *
 * Flow:
 *   1. Load Distribution aggregate → lấy snapshotId + tenantId
 *   2. Load ReleaseSnapshot → kiểm tra trường bắt buộc
 *   3. Load Tenant → đọc cờ `requiresManualReview`
 *   4. Nếu CLEAN → trả `MARK_VALIDATED` với requiresReview từ tenant
 *   5. Nếu LỖI → mở ticket VALIDATION + trả `FLAG_VALIDATION_ERRORS`
 *
 * Trường bắt buộc (spec Phase 5 Khối A):
 *   Release: title, labelId, primaryGenreId, albumFormatId, priceTierId,
 *            cLineYear, cLineOwner, pLineYear, pLineOwner, releaseDate
 *   Nested: ≥1 track, ≥1 releaseArtist, ≥1 releaseCoverArt, ≥1 territory
 *   Track: title, isrc (mỗi track)
 */
@Injectable()
export class ValidateRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(RELEASE_SNAPSHOT_READER)
		private readonly snapshotReader: ReleaseSnapshotReader,
		@Inject(TICKET_SERVICE)
		private readonly ticketService: TicketService,
	) {}

	async run(
		payload: JobPayload,
	): Promise<MarkValidatedCommand | FlagValidationErrorsCommand> {
		// 1. Load Distribution
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		// 2. Load Snapshot
		const snapshot = await this.snapshotReader.loadById(dist.snapshotId);
		if (!snapshot) {
			// Snapshot missing = invariant violation (should never happen)
			const errors = [`Snapshot ${dist.snapshotId} not found`];
			const ticketRef = await this.openValidationTicket(
				dist.id,
				payload.key,
				errors,
			);
			return {
				type: 'FLAG_VALIDATION_ERRORS',
				distributionId: dist.id,
				key: `${payload.key}:validation-error`,
				ticketRef,
				errors,
			};
		}

		// 3. Validate required fields
		const errors = this.validateSnapshot(snapshot);
		if (errors.length > 0) {
			const ticketRef = await this.openValidationTicket(
				dist.id,
				payload.key,
				errors,
			);
			return {
				type: 'FLAG_VALIDATION_ERRORS',
				distributionId: dist.id,
				key: `${payload.key}:validation-error`,
				ticketRef,
				errors,
			};
		}

		// 4. Load Tenant to check requiresManualReview flag
		// NOTE: Khối A hardcode false; Khối B sẽ thêm cột tenant.requiresManualReview
		const requiresReview = false;

		// 5. Clean → MARK_VALIDATED
		return {
			type: 'MARK_VALIDATED',
			distributionId: dist.id,
			key: `${payload.key}:validated`,
			requiresReview,
		};
	}

	/**
	 * Validate snapshot required fields.
	 * @returns array of error messages (empty = clean)
	 */
	private validateSnapshot(snapshot: any): string[] {
		const errors: string[] = [];

		// Release-level required fields
		if (!snapshot.title) errors.push('Release title is required');
		if (!snapshot.labelId) errors.push('Label is required');
		if (!snapshot.primaryGenreId) errors.push('Primary genre is required');
		if (!snapshot.albumFormatId) errors.push('Album format is required');
		if (!snapshot.priceTierId) errors.push('Price tier is required');
		if (!snapshot.cLineYear) errors.push('C-Line year is required');
		if (!snapshot.cLineOwner) errors.push('C-Line owner is required');
		if (!snapshot.pLineYear) errors.push('P-Line year is required');
		if (!snapshot.pLineOwner) errors.push('P-Line owner is required');
		if (!snapshot.releaseDate) errors.push('Release date is required');

		// Nested arrays: at least 1 item
		const tracks = snapshot.tracks || [];
		const artists = snapshot.releaseArtists || [];
		const coverArts = snapshot.releaseCoverArts || [];
		const territories = snapshot.territories || [];

		if (tracks.length === 0) errors.push('At least 1 track is required');
		if (artists.length === 0) errors.push('At least 1 artist is required');
		if (coverArts.length === 0)
			errors.push('At least 1 cover art is required');
		if (territories.length === 0)
			errors.push('At least 1 territory is required');

		// Track-level validation (each track needs title + ISRC)
		tracks.forEach((track: any, idx: number) => {
			if (!track.title)
				errors.push(`Track ${idx + 1}: title is required`);
			if (!track.isrc) errors.push(`Track ${idx + 1}: ISRC is required`);
		});

		return errors;
	}

	/**
	 * Open VALIDATION ticket (idempotent by key).
	 */
	private async openValidationTicket(
		distributionId: string,
		key: string,
		errors: string[],
	): Promise<string> {
		const ticketRef = await this.ticketService.open({
			distributionId,
			key: IdempotencyKey.create(`${key}:validation`),
			reason: TicketReason.VALIDATION,
			detail: JSON.stringify({ errors }),
		});
		return ticketRef.value;
	}
}
