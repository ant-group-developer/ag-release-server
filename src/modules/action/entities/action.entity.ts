import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { DspAction } from 'src/modules/dsp-action/entities/dsp-action.entities';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('actions', {
	comment:
		'Danh sách hành động hệ thống dùng cho tích hợp DSP và các chính sách xử lý',
})
export class Action extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên hành động',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã hành động duy nhất trong hệ thống',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Mô tả hoặc ghi chú cho hành động',
	})
	note: string | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => DspAction, (dspAction) => dspAction.action)
	dspActions: DspAction[];

	@OneToMany(() => TrackPolicy, (trackPolicy) => trackPolicy.action)
	trackPolicies?: TrackPolicy[];

	dspActionCount?: number;
}
