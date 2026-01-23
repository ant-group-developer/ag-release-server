import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { DealType } from '../../deal-type/entities/deal-type.entity';
import { DspDealConfigEntity } from '../../dsp-deal-config/entities/dsp-deal-config.entity';
import { UserDspDealSelectionMode } from '../enum/user-dsp-deal-selection.enum';

@Entity({ name: 'user_dsp_deal_selection' })
export class UserDspDealSelectionEntity extends BaseUserTrackedUUIDEntity {
	@PrimaryColumn({ name: 'user_id', type: 'bigint' })
	userId: string;

	@PrimaryColumn({ name: 'dsp_id', type: 'bigint' })
	dspId: string;

	@Column({ name: 'deal_type_id', type: 'bigint' })
	dealTypeId: string;

	@Column({ name: 'override_config_id', type: 'bigint', nullable: true })
	overrideConfigId: string | null;

	@Column({ type: 'varchar', length: 20 })
	mode: UserDspDealSelectionMode;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user?: User;

	@ManyToOne(() => Dsp, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp?: Dsp;

	@ManyToOne(() => DealType, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'deal_type_id' })
	dealType?: DealType;

	@ManyToOne(() => DspDealConfigEntity, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn({ name: 'override_config_id' })
	overrideConfig?: DspDealConfigEntity;
}
