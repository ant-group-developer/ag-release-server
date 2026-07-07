import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { Release } from './release.entity';

export enum ReleaseEnrichmentStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	SUCCESS = 'SUCCESS',
	FAILED = 'FAILED',
	NOT_FOUND = 'NOT_FOUND',
}

@Entity('release_enrichments', {
	comment: 'Bảng theo dõi trạng thái enrich metadata của từng release',
})
export class ReleaseEnrichment extends BaseUUIDEntity {
	@Column({
		name: 'release_id',
		type: 'uuid',
		unique: true,
		comment: 'ID release',
	})
	releaseId: string;

	@Column({
		type: 'varchar',
		length: 20,
		default: ReleaseEnrichmentStatus.PENDING,
		comment: 'Trạng thái enrich: PENDING, SUCCESS, FAILED, NOT_FOUND',
	})
	status: ReleaseEnrichmentStatus;

	@Column({
		name: 'last_scanned_at',
		type: 'timestamp with time zone',
		nullable: true,
		comment: 'Thời điểm quét cuối cùng',
	})
	lastScannedAt: Date | null;

	@Column({
		name: 'error_message',
		type: 'text',
		nullable: true,
		comment: 'Lỗi chi tiết nếu status = FAILED',
	})
	errorMessage: string | null;

	@Column({
		name: 'last_scan_id',
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'ID của đợt quét cuối cùng',
	})
	lastScanId: string | null;

	@Column({
		name: 'enrichment_source',
		type: 'varchar',
		length: 20,
		nullable: true,
		comment: 'Nguồn enrich: spotify, deezer, etc.',
	})
	enrichmentSource: string | null;

	@OneToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
