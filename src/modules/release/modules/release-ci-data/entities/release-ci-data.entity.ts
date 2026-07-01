import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

export enum ReleaseCiDataStatus {
	EXISTS_ON_CI = 'EXISTS_ON_CI',
	NOT_FOUND_ON_CI = 'NOT_FOUND_ON_CI',
}

@Entity('release_ci_data')
export class ReleaseCiData extends BaseUUIDEntity {
	@Column({ name: 'release_id', type: 'uuid', unique: true })
	releaseId: string;

	@OneToOne(() => Release, (release) => release.ciData, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		name: 'latest_synced_at',
		type: 'timestamp with time zone',
		nullable: true,
	})
	latestSyncedAt: Date | null;

	@Column({
		type: 'enum',
		enum: ReleaseCiDataStatus,
		default: ReleaseCiDataStatus.NOT_FOUND_ON_CI,
	})
	status: ReleaseCiDataStatus;

	@Column({ name: 'import_raw_data', type: 'jsonb', nullable: true })
	importRawData: Record<string, any> | null;

	@Column({ name: 'export_raw_data', type: 'jsonb', nullable: true })
	exportRawData: Record<string, any> | null;

	@Column({ name: 'import_parsed_data', type: 'jsonb', nullable: true })
	importParsedData: Record<string, any> | null;

	@Column({ name: 'export_parsed_data', type: 'jsonb', nullable: true })
	exportParsedData: Record<string, any> | null;
}
