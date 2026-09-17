import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'release_snapshots', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_snapshot_release_id', ['releaseId'])
export class ReleaseSnapshotV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ name: 'source_updated_at', type: 'timestamptz', nullable: true })
	sourceUpdatedAt!: Date | null;

	@Column({ type: 'jsonb' })
	payload!: Record<string, unknown>;

	@Column({
		name: 'asset_manifest',
		type: 'jsonb',
		default: () => "'{}'::jsonb",
	})
	assetManifest!: Record<string, unknown>;

	@Column({
		name: 'selected_dsp_codes',
		type: 'jsonb',
		default: () => "'[]'::jsonb",
	})
	selectedDspCodes!: string[];

	@Column({ name: 'content_hash', type: 'varchar', length: 128 })
	contentHash!: string;

	@Column({ name: 'track_order_hash', type: 'varchar', length: 128 })
	trackOrderHash!: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
