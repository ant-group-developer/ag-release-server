import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Release } from './release.entity';

export enum ReleaseLogStatus {
	PENDING = 'PENDING',
	SUCCESS = 'SUCCESS',
	FAILED = 'FAILED',
}

@Entity('release_logs')
export class ReleaseLog extends BaseUUIDEntity {
	@Column()
	releaseId: string;

	@ManyToOne(() => Release, (release) => release.logs, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'varchar', nullable: true })
	dspCode: string | null;

	@Column({ nullable: true })
	dspId: string | null;

	@ManyToOne(() => Dsp, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'dsp_id' })
	dsp?: Dsp | null;

	@Column({ type: 'text', nullable: true })
	logs?: string;

	@Column({ type: 'jsonb', nullable: true })
	content?: Record<string, any> | null;

	@Column({
		type: 'enum',
		enum: ReleaseLogStatus,
		default: ReleaseLogStatus.PENDING,
	})
	status: ReleaseLogStatus;

	// bước bị lỗi (vd: VALIDATE, UPLOAD_S3, PUSH_SPOTIFY,...)
	@Column({ length: 100 })
	step: string;
}
