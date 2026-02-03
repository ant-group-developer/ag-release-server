import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Action } from 'src/modules/action/entities/action.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('dsp_action', {
	comment: 'Bảng mapping giữa DSP và các hành động được hỗ trợ',
})
@Unique(['dspId', 'actionId'])
export class DspAction extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID của DSP',
	})
	dspId: string;

	@Column({
		type: 'uuid',
		comment: 'ID của hành động',
	})
	actionId: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu hành động mặc định của DSP',
	})
	isDefault: boolean;

	@ManyToOne(() => Action)
	@JoinColumn({ name: 'action_id' })
	action: Action;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
