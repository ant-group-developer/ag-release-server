// src/modules/aggregators/aggregator.entity.ts
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { DspRoutingConfig } from '../../dsp-routing/entities/dsp-routing-config.entity';
import { SftpConfig } from '../../sftp-configs/entities/sftp-config.entity';

@Entity({ name: 'aggregators' })
export class Aggregator extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	name: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE })
	code: string;

	@OneToOne(() => SftpConfig, (c) => c.aggregator)
	sftpConfig: SftpConfig;

	@OneToMany(() => DspRoutingConfig, (d) => d.aggregator)
	dspRoutingConfigs: DspRoutingConfig[];
}
