import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { DealTypeEntity } from '../../deal-type/entities/deal-type.entity';
import {
	DspDealConfigScope,
	DspDealConfigStatus,
} from '../enum/dsp-deal-config.enum';

@Entity({ name: 'dsp_deal_configs' })
@Index('ux_dsp_deal_configs_global_default', ['dspId', 'dealTypeId'], {
	unique: true,
	where: `"scope" = 'GLOBAL_DEFAULT'`,
})
@Index('ux_dsp_deal_configs_user_override', ['userId', 'dspId', 'dealTypeId'], {
	unique: true,
	where: `"scope" = 'USER_OVERRIDE'`,
})
export class DspDealConfigEntity {
	@Column({ type: 'bigint', primary: true, generated: 'increment' })
	id: string;

	@Column({ name: 'dsp_id', type: 'bigint' })
	dspId: string;

	@Column({ name: 'deal_type_id', type: 'bigint' })
	dealTypeId: string;

	@Column({ name: 'user_id', type: 'bigint', nullable: true })
	userId: string | null;

	@Column({ type: 'varchar', length: 30 })
	scope: DspDealConfigScope;

	@Column({ name: 'config_json', type: 'jsonb' })
	configJson: Record<string, any>;

	@Column({
		type: 'varchar',
		length: 20,
		default: DspDealConfigStatus.ACTIVE,
	})
	status: DspDealConfigStatus;

	@ManyToOne(() => Dsp, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp?: Dsp;

	@ManyToOne(() => DealTypeEntity, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'deal_type_id' })
	dealType?: DealTypeEntity;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'user_id' })
	user?: User;
}
