import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

export enum ReleaseCiDataStatus {
	EXISTS_ON_CI = 'EXISTS_ON_CI',
	NOT_FOUND_ON_CI = 'NOT_FOUND_ON_CI',
}

export interface ReleaseCiExportParsedData {
	exportOrder: string | number | null;
	exportTask: string | null;
	requestorOrganisation: string | null;
	deliveryPoint: string | null;
	deliveryPointStatus: string | null;
	externalBatchId: string | null;
	transferEndDate: string | null;
}

export interface ReleaseCiImportParsedData {
	status: string | null;
	modify_time: string | null;
}

export interface ReleaseCiQaFlagType {
	type: string;
	category: string | null;
	is_blocker: boolean | null;
	is_closeable: boolean | null;
	is_placeholder: boolean | null;
	public_name: string | null;
	qa_advice_id: string | null;
	advisor_message: string | null;
	severity: string | null;
	suggested_action: string | null;
	id: number;
	modify_time: string | null;
}

export interface ReleaseCiQaFlag {
	type: string;
	closed_date: string | null;
	closed_log_message: string | null;
	watchlist_match_detail: unknown | null;
	track_number: number | null;
	volume_part: number | null;
	qa_flag_type: ReleaseCiQaFlagType;
	qa_flag_id: string;
	id: number;
	create_time: string | null;
	modify_time: string | null;
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
	importParsedData: ReleaseCiImportParsedData | null;

	@Column({ name: 'import_count', type: 'int', default: 0 })
	importCount: number;

	@Column({ name: 'export_parsed_data', type: 'jsonb', nullable: true })
	exportParsedData: ReleaseCiExportParsedData[] | null;

	// @Column({ name: 'qa_flags_ci', type: 'jsonb', nullable: true })
	// qaFlagsCi: ReleaseCiQaFlag[] | null;

	@Column({ name: 'qa_flags_ci', type: 'jsonb', nullable: true })
	qaFlagsCi: Record<string, any>[] | null;

	@Column({ name: 'need_import_again', type: 'boolean', default: true })
	needImportAgain: boolean;

	dspsLive?: string;
	dspsLiveCount?: number;
	dspsTotalCount?: number;
}
