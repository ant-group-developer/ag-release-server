import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Aggregator } from 'src/modules/distribution/aggregator/entities/aggregator.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { StepStatus, StepType } from '../enum/release-execution.enum';
import { ReleaseExecutionDsp } from './release-execution-dsp.entity';

@Entity('release_execution_steps')
export class ReleaseExecutionStep extends BaseUUIDEntity {
    @Column({ name: 'execution_dsp_id', type: 'uuid' })
    executionDspId: string;

    @ManyToOne(() => ReleaseExecutionDsp, dsp => dsp.steps, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'execution_dsp_id' })
    executionDsp: ReleaseExecutionDsp;

    @Column({ type: 'enum', enum: StepType })
    stepType: StepType;

    @Column({ type: 'enum', enum: StepStatus, default: StepStatus.PENDING })
    status: StepStatus;

    @Column({ type: 'int', default: 0 })
    order: number;

    // Phục vụ tracking, nếu step này lấy metadata chung của Aggregator (ví dụ CI)
    @Column({ name: 'aggregator_id', type: 'uuid', nullable: true })
    aggregatorId: string | null;

    @ManyToOne(() => Aggregator, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'aggregator_id' })
    aggregator: Aggregator | null;

    @Column({ type: 'text', nullable: true })
    logs: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
    startedAt: Date | null;

    @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
    completedAt: Date | null;

    @Column({ name: 'completed_by', type: 'uuid', nullable: true })
    completedById: string | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'completed_by' })
    completedBy: User | null;

    @Column({ type: 'int', default: 0 })
    retryCount: number;
}
