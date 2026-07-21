import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * ORM entity map bảng "release_snapshot".
 *
 * Immutable jsonb clone của Release entity tại thời điểm submit distribution.
 * DdexXmlPackageBuilder đọc snapshot để build DDEX — KHÔNG phụ thuộc Release module.
 *
 * Payload chứa: title, upc, tracks[], releaseArtists[], releaseCoverArts[],
 * releaseDate, label, pLine, cLine, territories, albumFormat, etc.
 */
@Entity('release_snapshot')
@Index('IDX_release_snapshot_release_id', ['releaseId'])
export class ReleaseSnapshotOrmEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	releaseId!: string;

	/** Full Release entity clone at submit time. */
	@Column({ type: 'jsonb' })
	payload!: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
