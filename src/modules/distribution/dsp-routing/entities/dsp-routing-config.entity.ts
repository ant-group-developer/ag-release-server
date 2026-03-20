import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToOne,
	Unique,
} from 'typeorm';
import { Aggregator } from '../../aggregator/entities/aggregator.entity';
import { SftpConfig } from '../../sftp-configs/entities/sftp-config.entity';
import { RoutingModeEnum } from '../enum/dsp-routing.enum';

@Entity({ name: 'dsp_routing_configs' })
@Unique(['dspId'])
export class DspRoutingConfig extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 10, name: 'dsp_id' })
	dspId: string;

	@Column({ type: 'uuid', name: 'aggregator_id', nullable: true })
	aggregatorId: string | null;

	@Column({ type: 'uuid', name: 'sftp_config_id', nullable: true })
	sftpConfigId: string | null;

	@Column({ type: 'boolean', name: 'is_active', default: true })
	isActive: boolean;

	@Column({ type: 'enum', enum: RoutingModeEnum })
	mode: RoutingModeEnum;

	@ManyToOne(() => Aggregator, (a) => a.dspRoutingConfigs, {
		nullable: true,
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'aggregator_id' })
	aggregator: Aggregator | null;

	@OneToOne(() => SftpConfig)
	@JoinColumn({ name: 'sftp_config_id' })
	sftpConfig: SftpConfig | null;

	@OneToOne(() => Dsp, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
