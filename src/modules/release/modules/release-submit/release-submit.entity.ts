import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

export enum ReleaseSubmitStatus {
	NEW = 'new',
	PROCESSING = 'processing',
	WAITING_ACTION = 'waiting_action',
	DONE = 'done',
	FAILED = 'failed',
}

@Entity('release_submits')
export class ReleaseSubmit extends BaseUUIDEntity {
	@Column({
		name: 'release_id',
		type: 'uuid',
	})
	releaseId: string;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'enum',
		enum: ReleaseSubmitStatus,
		default: ReleaseSubmitStatus.NEW,
	})
	status: ReleaseSubmitStatus;

    metadata: {
        input: {
            releaseSnapshot: Release;
        },
    }
}