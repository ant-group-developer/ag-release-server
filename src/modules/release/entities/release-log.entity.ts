import { BaseUUIDEntity } from 'src/common/entities/base.entity';
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
	@JoinColumn({ name: 'releaseId' })
	release: Release;

	@Column({ type: 'text', nullable: true })
	logs: string;

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
