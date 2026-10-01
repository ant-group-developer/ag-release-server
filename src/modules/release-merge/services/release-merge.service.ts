import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { normalizeUpc } from 'src/utils/upc.util';
import { DataSource, EntityManager, In } from 'typeorm';
import { ReleaseMergeAlias } from '../entities/release-merge-alias.entity';
import { ReleaseMergeItem } from '../entities/release-merge-item.entity';
import { TrackMergeAlias } from '../entities/track-merge-alias.entity';
import { ReleaseMergeItemStatus } from '../enum/release-merge.enum';
import {
	areEquivalentUpcs,
	isRealIsrc,
	isReportPlaceholderUpc,
	normalizeMergeIsrc,
} from '../release-merge.util';

interface MergeReleaseSnapshot {
	id: string;
	upc: string | null;
	title: string | null;
	type: string;
	tenantId: string;
	labelId: string | null;
	isImportedFromReport: boolean;
	updatedAt: Date;
}

export interface ReleaseMergePairPlan {
	source: MergeReleaseSnapshot;
	target: MergeReleaseSnapshot;
	sharedIsrcs: string[];
	sourceOnlyIsrcs: string[];
	targetOnlyIsrcs: string[];
	sourceTrackCount: number;
	targetTrackCount: number;
	upcEquivalent: boolean;
	autoSafe: boolean;
	reasonCodes: string[];
}

export interface ApplyReleaseMergeInput {
	sourceReleaseId: string;
	targetReleaseId: string;
	mergeItemId?: string | null;
	userId?: string | null;
	force?: boolean;
}

export interface ApplyReleaseMergeResult {
	sourceReleaseId: string;
	targetReleaseId: string;
	mergedTrackCount: number;
	idempotent: boolean;
}

type ForeignKeyReference = { table_name: string; column_name: string };

const ALLOWED_RELEASE_CHILD_TABLES = new Set([
	'tracks',
	'release_artist',
	'asset_ownership_periods',
	'asset_ownership_transfer_events',
	'release_enrichments',
]);

const ALLOWED_TRACK_CHILD_TABLES = new Set(['track_artist']);

@Injectable()
export class ReleaseMergeService {
	constructor(private readonly dataSource: DataSource) {}

	async preparePair(
		sourceReleaseId: string,
		targetReleaseId: string,
	): Promise<ReleaseMergePairPlan> {
		const [source, target] = await Promise.all([
			this.dataSource.getRepository(Release).findOne({
				where: { id: sourceReleaseId },
			}),
			this.dataSource.getRepository(Release).findOne({
				where: { id: targetReleaseId },
			}),
		]);
		if (!source)
			throw new NotFoundException(
				`Source release ${sourceReleaseId} not found`,
			);
		if (!target)
			throw new NotFoundException(
				`Target release ${targetReleaseId} not found`,
			);

		const tracks = await this.dataSource.getRepository(Track).find({
			where: { releaseId: In([sourceReleaseId, targetReleaseId]) },
			order: { order: 'ASC' },
		});
		return this.buildPairPlan(source, target, tracks);
	}

	async apply(
		input: ApplyReleaseMergeInput,
	): Promise<ApplyReleaseMergeResult> {
		return this.dataSource.transaction((manager) =>
			this.applyInTransaction(manager, input),
		);
	}

	async applyInTransaction(
		manager: EntityManager,
		input: ApplyReleaseMergeInput,
	): Promise<ApplyReleaseMergeResult> {
		const existingAlias = await manager.findOne(ReleaseMergeAlias, {
			where: { sourceReleaseId: input.sourceReleaseId },
		});
		if (existingAlias) {
			if (existingAlias.targetReleaseId !== input.targetReleaseId) {
				throw new ConflictException(
					`Source ${input.sourceReleaseId} was already merged into ${existingAlias.targetReleaseId}`,
				);
			}
			if (input.mergeItemId) {
				await manager.update(ReleaseMergeItem, input.mergeItemId, {
					status: ReleaseMergeItemStatus.APPLIED,
					appliedBy: input.userId ?? null,
					appliedAt: new Date(),
					errorMessage: null,
				});
			}
			return {
				sourceReleaseId: input.sourceReleaseId,
				targetReleaseId: input.targetReleaseId,
				mergedTrackCount: 0,
				idempotent: true,
			};
		}

		await manager.query(
			`SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))`,
			[
				`release-merge:${input.sourceReleaseId}`,
				`release-merge:${input.targetReleaseId}`,
			],
		);

		const releases = await manager
			.getRepository(Release)
			.createQueryBuilder('release')
			.setLock('pessimistic_write')
			.where('release.id IN (:...ids)', {
				ids: [input.sourceReleaseId, input.targetReleaseId],
			})
			.getMany();
		const source = releases.find(
			(release) => release.id === input.sourceReleaseId,
		);
		const target = releases.find(
			(release) => release.id === input.targetReleaseId,
		);
		if (!source)
			throw new NotFoundException(
				`Source release ${input.sourceReleaseId} not found`,
			);
		if (!target)
			throw new NotFoundException(
				`Target release ${input.targetReleaseId} not found`,
			);

		const tracks = await manager
			.getRepository(Track)
			.createQueryBuilder('track')
			.setLock('pessimistic_write')
			.where('track.releaseId IN (:...ids)', {
				ids: [source.id, target.id],
			})
			.orderBy('track.order', 'ASC')
			.getMany();
		const plan = this.buildPairPlan(source, target, tracks);
		if (!plan.autoSafe && !(input.force && this.isForceEligible(plan))) {
			throw new ConflictException(
				`Merge is not auto-safe: ${plan.reasonCodes.join(', ')}`,
			);
		}

		const sourceTracks = tracks.filter(
			(track) => track.releaseId === source.id,
		);
		const targetTracks = tracks.filter(
			(track) => track.releaseId === target.id,
		);
		const targetByIsrc = new Map(
			targetTracks
				.filter((track) => isRealIsrc(track.isrc))
				.map((track) => [normalizeMergeIsrc(track.isrc), track]),
		);

		await this.assertOnlyOneCanonicalTarget(
			manager,
			sourceTracks,
			target.id,
		);
		const detached = await this.detachUnmatchedTracks(
			manager,
			source,
			sourceTracks,
			targetByIsrc,
			input.userId ?? null,
		);
		const matchedSourceTracks = sourceTracks.filter(
			(track) => !detached.trackIds.includes(track.id),
		);
		await this.assertImportedRelationsOnly(
			manager,
			source.id,
			matchedSourceTracks.map((track) => track.id),
		);
		await this.assertNoUnexpectedReferences(
			manager,
			'releases',
			[source.id],
			ALLOWED_RELEASE_CHILD_TABLES,
		);
		await this.assertNoUnexpectedReferences(
			manager,
			'tracks',
			matchedSourceTracks.map((track) => track.id),
			ALLOWED_TRACK_CHILD_TABLES,
		);

		const now = new Date();
		for (const sourceTrack of matchedSourceTracks) {
			const normalizedIsrc = normalizeMergeIsrc(sourceTrack.isrc);
			const targetTrack = targetByIsrc.get(normalizedIsrc);
			if (!targetTrack) {
				throw new ConflictException(
					`Source track ${sourceTrack.id} (${sourceTrack.isrc}) has no canonical counterpart`,
				);
			}
			await manager
				.createQueryBuilder()
				.insert()
				.into(TrackMergeAlias)
				.values({
					sourceTrackId: sourceTrack.id,
					targetTrackId: targetTrack.id,
					isrc: normalizedIsrc,
					sourceReleaseId: source.id,
					targetReleaseId: target.id,
					mergeItemId: input.mergeItemId ?? null,
				})
				.orIgnore()
				.execute();
		}

		await manager
			.createQueryBuilder()
			.insert()
			.into(ReleaseMergeAlias)
			.values({
				sourceReleaseId: source.id,
				targetReleaseId: target.id,
				mergeItemId: input.mergeItemId ?? null,
				sourceUpc: source.upc,
				sourceTitle: source.title,
				sourceSnapshot: {
					type: source.type,
					tenantId: source.tenantId,
					labelId: source.labelId,
					isImportedFromReport: source.isImportedFromReport,
					updatedAt: source.updatedAt,
				},
				mergedAt: now,
			} as any)
			.orIgnore()
			.execute();

		await this.upsertStatIdentity(
			manager,
			source.upc,
			source.id,
			target.id,
			input.mergeItemId,
		);
		await this.upsertStatIdentity(
			manager,
			target.upc,
			source.id,
			target.id,
			input.mergeItemId,
		);
		await this.mergeOwnershipBaseline(manager, source, target);

		const sourceTrackIds = matchedSourceTracks.map((track) => track.id);
		if (sourceTrackIds.length) {
			await manager.query(
				`DELETE FROM "track_artist" WHERE "track_id" = ANY($1)`,
				[sourceTrackIds],
			);
			await manager.delete(Track, { id: In(sourceTrackIds) });
		}
		if (detached.trackIds.length) {
			await manager.query(
				`UPDATE track_artist
				 SET release_artist_id = NULL, updated_at = now()
				 WHERE track_id = ANY($1)`,
				[detached.trackIds],
			);
		}
		await manager.query(
			`DELETE FROM "release_artist" WHERE "release_id" = $1`,
			[source.id],
		);
		await manager.query(
			`DELETE FROM "release_enrichments" WHERE "release_id" = $1`,
			[source.id],
		);
		await manager.delete(Release, source.id);

		await this.enqueueTargetSync(
			manager,
			[target.id, ...detached.releaseIds],
			[...targetTracks.map((track) => track.id), ...detached.trackIds],
		);

		if (input.mergeItemId) {
			await manager.update(ReleaseMergeItem, input.mergeItemId, {
				status: ReleaseMergeItemStatus.APPLIED,
				appliedBy: input.userId ?? null,
				appliedAt: now,
				errorMessage: null,
			});
		}

		return {
			sourceReleaseId: source.id,
			targetReleaseId: target.id,
			mergedTrackCount: matchedSourceTracks.length,
			idempotent: false,
		};
	}

	/**
	 * Force is intentionally narrow: only a structurally identical imported
	 * release pair blocked by a non-equivalent UPC can bypass auto-safe mode.
	 */
	isForceEligible(plan: ReleaseMergePairPlan): boolean {
		return (
			!plan.autoSafe &&
			plan.reasonCodes.length === 1 &&
			plan.reasonCodes[0] === 'UPC_NOT_EQUIVALENT' &&
			plan.sharedIsrcs.length > 0 &&
			plan.sourceOnlyIsrcs.length === 0 &&
			plan.targetOnlyIsrcs.length === 0
		);
	}

	buildPairPlan(
		source: Release,
		target: Release,
		tracks: Track[],
	): ReleaseMergePairPlan {
		const sourceTracks = tracks.filter(
			(track) => track.releaseId === source.id,
		);
		const targetTracks = tracks.filter(
			(track) => track.releaseId === target.id,
		);
		const sourceIsrcs = new Set(
			sourceTracks
				.filter((track) => isRealIsrc(track.isrc))
				.map((track) => normalizeMergeIsrc(track.isrc)),
		);
		const targetIsrcs = new Set(
			targetTracks
				.filter((track) => isRealIsrc(track.isrc))
				.map((track) => normalizeMergeIsrc(track.isrc)),
		);
		const sharedIsrcs = [...sourceIsrcs]
			.filter((isrc) => targetIsrcs.has(isrc))
			.sort();
		const sourceOnlyIsrcs = [...sourceIsrcs]
			.filter((isrc) => !targetIsrcs.has(isrc))
			.sort();
		const targetOnlyIsrcs = [...targetIsrcs]
			.filter((isrc) => !sourceIsrcs.has(isrc))
			.sort();
		const reasonCodes: string[] = [];
		if (!source.isImportedFromReport)
			reasonCodes.push('SOURCE_NOT_IMPORTED');
		if (target.isImportedFromReport)
			reasonCodes.push('TARGET_NOT_CANONICAL');
		if (source.type !== target.type)
			reasonCodes.push('RELEASE_TYPE_MISMATCH');
		if (!sourceTracks.length) reasonCodes.push('SOURCE_HAS_NO_TRACKS');
		if (sourceTracks.some((track) => !track.isImportedFromReport)) {
			reasonCodes.push('SOURCE_HAS_NON_IMPORTED_TRACK');
		}
		// ISRC chỉ có ở release report không chặn merge. apply() tách mỗi
		// ISRC thành một release import mới trước khi xóa release nguồn.
		if (!sharedIsrcs.length) reasonCodes.push('NO_SHARED_ISRC');

		const upcEquivalent = areEquivalentUpcs(source.upc, target.upc);
		if (!upcEquivalent && !isReportPlaceholderUpc(source.upc)) {
			reasonCodes.push('UPC_NOT_EQUIVALENT');
		}

		return {
			source: this.toReleaseSnapshot(source),
			target: this.toReleaseSnapshot(target),
			sharedIsrcs,
			sourceOnlyIsrcs,
			targetOnlyIsrcs,
			sourceTrackCount: sourceTracks.length,
			targetTrackCount: targetTracks.length,
			upcEquivalent,
			autoSafe: reasonCodes.length === 0,
			reasonCodes,
		};
	}

	private toReleaseSnapshot(release: Release): MergeReleaseSnapshot {
		return {
			id: release.id,
			upc: release.upc,
			title: release.title,
			type: release.type,
			tenantId: release.tenantId,
			labelId: release.labelId,
			isImportedFromReport: release.isImportedFromReport,
			updatedAt: release.updatedAt,
		};
	}

	private async assertOnlyOneCanonicalTarget(
		manager: EntityManager,
		sourceTracks: Track[],
		targetReleaseId: string,
	): Promise<void> {
		const isrcs = sourceTracks
			.map((track) => normalizeMergeIsrc(track.isrc))
			.filter(Boolean);
		const rows: { release_id: string }[] = await manager.query(
			`SELECT DISTINCT r.id AS release_id
			 FROM tracks t
			 JOIN releases r ON r.id = t.release_id
			 WHERE upper(regexp_replace(btrim(t.isrc), '[-[:space:]]', '', 'g')) = ANY($1)
			   AND r.is_imported_from_report = false`,
			[isrcs],
		);
		const ids = rows.map((row) => row.release_id);
		if (ids.length !== 1 || ids[0] !== targetReleaseId) {
			throw new ConflictException(
				`Source maps to canonical releases [${ids.join(', ')}], expected only ${targetReleaseId}`,
			);
		}
	}

	/**
	 * Bài không có trên canonical được chuyển sang release import mới,
	 * UPC `ISRC-{isrc}`. Period owner được copy nguyên, kể cả lần chuyển
	 * sang tenant mới, rồi release report trùng mới bị xóa.
	 */
	private async detachUnmatchedTracks(
		manager: EntityManager,
		source: Release,
		sourceTracks: Track[],
		targetByIsrc: Map<string, Track>,
		userId: string | null,
	): Promise<{ releaseIds: string[]; trackIds: string[] }> {
		const grouped = new Map<string, Track[]>();
		for (const track of sourceTracks) {
			if (!isRealIsrc(track.isrc)) continue;
			const isrc = normalizeMergeIsrc(track.isrc);
			if (targetByIsrc.has(isrc)) continue;
			const list = grouped.get(isrc) ?? [];
			list.push(track);
			grouped.set(isrc, list);
		}
		if (!grouped.size) return { releaseIds: [], trackIds: [] };

		const isrcs = [...grouped.keys()];
		const elsewhere: { release_id: string; isrc: string }[] =
			await manager.query(
				`SELECT r.id AS release_id,
				        upper(regexp_replace(btrim(t.isrc), '[-[:space:]]', '', 'g')) AS isrc
				 FROM tracks t
				 JOIN releases r ON r.id = t.release_id
				 WHERE upper(regexp_replace(btrim(t.isrc), '[-[:space:]]', '', 'g')) = ANY($1)
				   AND r.id <> $2`,
				[isrcs, source.id],
			);
		if (elsewhere.length) {
			const sample = elsewhere
				.slice(0, 5)
				.map((row) => `${row.isrc} → ${row.release_id}`)
				.join(', ');
			throw new ConflictException(
				`Unmatched ISRC already belongs to another release: ${sample}`,
			);
		}

		const placeholders = isrcs.map((isrc) => `ISRC-${isrc}`);
		const existingUpcs: { id: string; upc: string }[] = await manager.query(
			`SELECT id, upc FROM releases WHERE upper(btrim(upc)) = ANY($1)`,
			[placeholders],
		);
		if (existingUpcs.length) {
			throw new ConflictException(
				`Placeholder UPC already exists: ${existingUpcs
					.map((row) => row.upc)
					.join(', ')}`,
			);
		}

		const releaseIds: string[] = [];
		const trackIds: string[] = [];
		for (const [isrc, tracks] of grouped) {
			const created = await manager.save(
				Release,
				manager.create(Release, {
					type: source.type,
					upc: `ISRC-${isrc}`,
					title: (tracks[0].title || isrc).slice(0, 150),
					labelId: source.labelId,
					tenantId: source.tenantId,
					status: source.status,
					isImportedFromReport: true,
					importSourceType: source.importSourceType,
					importParserCode: source.importParserCode,
					importFileName: source.importFileName,
					importJobId: source.importJobId,
					creatorId: userId,
					modifierId: userId,
				}),
			);
			await this.copyOwnershipPeriods(
				manager,
				source.id,
				created.id,
				source.tenantId,
				source.labelId,
				userId,
			);
			for (const [index, track] of tracks.entries()) {
				await manager.update(Track, track.id, {
					releaseId: created.id,
					order: index + 1,
				});
				trackIds.push(track.id);
			}
			releaseIds.push(created.id);
		}
		return { releaseIds, trackIds };
	}

	private async copyOwnershipPeriods(
		manager: EntityManager,
		sourceReleaseId: string,
		targetReleaseId: string,
		tenantId: string,
		labelId: string | null,
		userId: string | null,
	): Promise<void> {
		const copied: { id: string }[] = await manager.query(
			`INSERT INTO asset_ownership_periods (
			   id, release_id, tenant_id, label_id,
			   effective_from, effective_to,
			   revenue_effective_from, revenue_effective_to,
			   asset_import_item_id, created_by, created_at, updated_at
			 )
			 SELECT gen_random_uuid(), $1, tenant_id, label_id,
			        effective_from, effective_to,
			        revenue_effective_from, revenue_effective_to,
			        NULL, $2, now(), now()
			 FROM asset_ownership_periods
			 WHERE release_id = $3
			 RETURNING id`,
			[targetReleaseId, userId, sourceReleaseId],
		);
		if (copied.length) return;
		await manager.query(
			`INSERT INTO asset_ownership_periods (
			   id, release_id, tenant_id, label_id,
			   effective_from, revenue_effective_from,
			   created_by, created_at, updated_at
			 )
			 VALUES (
			   gen_random_uuid(), $1, $2, $3,
			   DATE '1900-01-01', DATE '1900-01-01',
			   $4, now(), now()
			 )`,
			[targetReleaseId, tenantId, labelId, userId],
		);
	}

	private async assertImportedRelationsOnly(
		manager: EntityManager,
		sourceReleaseId: string,
		sourceTrackIds: string[],
	): Promise<void> {
		const nonImportedReleaseArtists = await manager.query(
			`SELECT id FROM release_artist
			 WHERE release_id = $1 AND is_imported_from_report = false LIMIT 1`,
			[sourceReleaseId],
		);
		if (nonImportedReleaseArtists.length) {
			throw new ConflictException(
				'SOURCE_HAS_NON_IMPORTED_RELEASE_ARTIST',
			);
		}
		if (!sourceTrackIds.length) return;
		const nonImportedTrackArtists = await manager.query(
			`SELECT id FROM track_artist
			 WHERE track_id = ANY($1) AND is_imported_from_report = false LIMIT 1`,
			[sourceTrackIds],
		);
		if (nonImportedTrackArtists.length) {
			throw new ConflictException('SOURCE_HAS_NON_IMPORTED_TRACK_ARTIST');
		}
	}

	private async assertNoUnexpectedReferences(
		manager: EntityManager,
		parentTable: 'releases' | 'tracks',
		ids: string[],
		allowedTables: Set<string>,
	): Promise<void> {
		if (!ids.length) return;
		const references: ForeignKeyReference[] = await manager.query(
			`SELECT child.relname AS table_name, attribute.attname AS column_name
			 FROM pg_constraint constraint_row
			 JOIN pg_class parent ON parent.oid = constraint_row.confrelid
			 JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
			 JOIN pg_class child ON child.oid = constraint_row.conrelid
			 JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
			 JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ord) ON true
			 JOIN pg_attribute attribute ON attribute.attrelid = child.oid AND attribute.attnum = key.attnum
			 WHERE constraint_row.contype = 'f'
			   AND parent_ns.nspname = 'public'
			   AND child_ns.nspname = 'public'
			   AND parent.relname = $1`,
			[parentTable],
		);

		const blockers: string[] = [];
		for (const reference of references) {
			if (allowedTables.has(reference.table_name)) continue;
			if (
				!/^[a-z0-9_]+$/.test(reference.table_name) ||
				!/^[a-z0-9_]+$/.test(reference.column_name)
			) {
				throw new ConflictException('INVALID_FOREIGN_KEY_METADATA');
			}
			const [row] = await manager.query(
				`SELECT COUNT(*)::int AS count FROM "${reference.table_name}" WHERE "${reference.column_name}" = ANY($1)`,
				[ids],
			);
			if (Number(row?.count ?? 0) > 0) {
				blockers.push(
					`${reference.table_name}.${reference.column_name}:${row.count}`,
				);
			}
		}
		if (blockers.length) {
			throw new ConflictException(
				`UNEXPECTED_DEPENDENCIES: ${blockers.join(', ')}`,
			);
		}
	}

	private async mergeOwnershipBaseline(
		manager: EntityManager,
		source: Release,
		target: Release,
	): Promise<void> {
		const [targetCount] = await manager.query(
			`SELECT COUNT(*)::int AS count FROM asset_ownership_periods WHERE release_id = $1`,
			[target.id],
		);
		if (Number(targetCount?.count ?? 0) === 0) {
			await manager.query(
				`UPDATE asset_ownership_periods
				 SET release_id = $1, tenant_id = $2, label_id = $3, updated_at = now()
				 WHERE release_id = $4`,
				[target.id, target.tenantId, target.labelId, source.id],
			);
		} else {
			await manager.query(
				`DELETE FROM asset_ownership_periods WHERE release_id = $1`,
				[source.id],
			);
		}
	}

	private async upsertStatIdentity(
		manager: EntityManager,
		upc: string | null,
		sourceReleaseId: string,
		targetReleaseId: string,
		mergeItemId?: string | null,
	): Promise<void> {
		if (!upc || isReportPlaceholderUpc(upc)) return;
		const normalized = normalizeUpc(upc);
		if (!normalized) return;
		await manager.query(
			`INSERT INTO release_stat_identities
			 (id, stat_key, key_type, release_id, track_id, source_release_id, merge_item_id, active)
			 VALUES (gen_random_uuid(), $1, 'UPC', $2, NULL, $3, $4, true)
			 ON CONFLICT (stat_key) WHERE active = true
			 DO UPDATE SET release_id = EXCLUDED.release_id,
			   source_release_id = EXCLUDED.source_release_id,
			   merge_item_id = EXCLUDED.merge_item_id,
			   updated_at = now()`,
			[
				`UPC-${normalized}`,
				targetReleaseId,
				sourceReleaseId,
				mergeItemId ?? null,
			],
		);
	}

	private async enqueueTargetSync(
		manager: EntityManager,
		releaseIds: string[],
		targetTrackIds: string[],
	): Promise<void> {
		for (const releaseId of releaseIds) {
			await manager.query(
				`INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
				 VALUES ('releases', $1, 'UPDATE', false)
				 ON CONFLICT (entity_name, entity_id) WHERE processed = false
				 DO UPDATE SET action = 'UPDATE', created_at = now(), error_message = NULL`,
				[releaseId],
			);
		}
		for (const trackId of targetTrackIds) {
			await manager.query(
				`INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
				 VALUES ('tracks', $1, 'UPDATE', false)
				 ON CONFLICT (entity_name, entity_id) WHERE processed = false
				 DO UPDATE SET action = 'UPDATE', created_at = now(), error_message = NULL`,
				[trackId],
			);
		}
		await manager.query(
			`SELECT pg_notify('clickhouse_sync_channel', 'release_merge')`,
		);
	}
}
