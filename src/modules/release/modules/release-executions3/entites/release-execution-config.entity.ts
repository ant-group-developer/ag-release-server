import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { ReleaseExecutionStepType } from '../enums/release-execution3.enum';

@Entity('release_execution_configs')
export class ReleaseExecutionConfig extends BaseUUIDEntity {
	@Column({
		name: 'cleanup_cron_value',
		type: 'varchar',
		default: '0 * * * *',
	})
	cleanupCronValue: string;

	@Column({
		name: 'step_configs',
		type: 'jsonb',
		default: [],
	})
	stepConfigs: Array<{
		stepType: ReleaseExecutionStepType;
		timeoutMinutes: number;
	}>;
}
