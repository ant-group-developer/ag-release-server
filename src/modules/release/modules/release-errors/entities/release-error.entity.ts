import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Release } from '../../../entities/release.entity';

export enum ReleaseErrorType {
	ADMIN_CREATE = 'admin_create',
	IMPORT_CI = 'import_ci',
	QA_FLAG_CI = 'qa_flag_ci',
}

@Entity('release_errors')
export class ReleaseError extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release, (release) => release.errors, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'boolean', name: 'is_fixed', default: false })
	isFixed: boolean;

	@Column({ type: 'varchar', nullable: true })
	messageCode?: string | null;

	@Column({ type: 'text' })
	message: string;

	@Column({ type: 'varchar', nullable: true })
	page?: string | null;

	@Column({ type: 'varchar', nullable: true })
	field?: string | null;

	@Column({ type: 'uuid', nullable: true })
	trackId?: string | null;

	@Column({
		type: 'enum',
		enum: ReleaseErrorType,
		nullable: true,
	})
	type?: ReleaseErrorType | null;
}
