import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Action } from 'src/modules/action/entities/action.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('dsp_action')
@Unique(['dspId', 'actionId'])
export class DspAction extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 10 })
	dspId: string;

	@Column({ type: 'uuid' })
	actionId: string;

	@Column({ type: 'boolean', default: false })
	isDefault: boolean;

	// relation
	@ManyToOne(() => Action)
	@JoinColumn({ name: 'action_id' })
	action: Action;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
