// src/modules/distribution/dsp-routing/entities/dsp-routing-setting.entity.ts
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { DeliveryConfig } from '../../delivery-config/entities/delivery-config.entity';
import { RoutingModeEnum } from '../enum/dsp-routing.enum';

@Entity({ name: 'dsp_routing_settings' })
export class DspRoutingSetting extends BaseUUIDEntity {
	@Column({ name: 'dsp_id', type: 'varchar' })
	dspId: string;

	/**
	 * DSP owner
	 */
	@OneToOne(() => Dsp, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@Column({
		type: 'enum',
		enum: RoutingModeEnum,
		default: RoutingModeEnum.AGGREGATOR,
	})
	mode: RoutingModeEnum;

	/**
	 * DIRECT mode -> SFTP config of DSP
	 */
	@Column({ name: 'direct_config_id', type: 'varchar', nullable: true })
	directConfigId: string | null;

	@ManyToOne(() => DeliveryConfig, { nullable: true })
	@JoinColumn({ name: 'direct_config_id' })
	directConfig: DeliveryConfig | null;

	/**
	 * AGGREGATOR mode -> override aggregator config
	 */
	@Column({
		name: 'specific_aggregator_config_id',
		type: 'varchar',
		nullable: true,
	})
	specificAggregatorConfigId: string | null;

	@ManyToOne(() => DeliveryConfig, { nullable: true })
	@JoinColumn({ name: 'specific_aggregator_config_id' })
	specificAggregatorConfig: DeliveryConfig | null;
}
