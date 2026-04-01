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

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'boolean', default: false })
	isDefault: boolean;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, nullable: true })
	ddexId: string | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, nullable: true })
	ddexName: string | null;

	@OneToOne(() => SftpConfig, (c) => c.aggregator)
	sftpConfig: SftpConfig;

	@OneToMany(() => DspRoutingConfig, (d) => d.aggregator)
	dspRoutingConfigs: DspRoutingConfig[];

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Tạo folder .done trên SFTP sau khi upload xong (CI aggregator cần)',
	})
	createsDoneFolder: boolean;

	@Column({
		type: 'int',
		name: 'dsp_usage_count',
		default: 0,
		comment: 'Số lần sử dụng DSP',
	})
	dspUsageCount: number;
}
