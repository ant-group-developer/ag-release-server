// src/modules/sftp-configs/entities/sftp-config.entity.ts
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { Aggregator } from '../../aggregator/entities/aggregator.entity';
import { DspRoutingConfig } from '../../dsp-routing/entities/dsp-routing-config.entity';
import { SftpMetadata } from '../type/sftp-config.type';

@Entity({ name: 'sftp_configs' })
export class SftpConfig extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 10, name: 'dsp_id', nullable: true })
	dspId: string | null;

	@Column({ type: 'uuid', name: 'aggregator_id', nullable: true })
	aggregatorId: string | null;

	@OneToOne(() => Aggregator, (a) => a.sftpConfig, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'aggregator_id' })
	aggregator: Aggregator | null;

	@Column({ type: 'json', nullable: true })
	metadata?: SftpMetadata;

	@OneToOne(() => DspRoutingConfig, {
		onDelete: 'CASCADE',
	})
	dspRoutingConfig: DspRoutingConfig | null;
}
