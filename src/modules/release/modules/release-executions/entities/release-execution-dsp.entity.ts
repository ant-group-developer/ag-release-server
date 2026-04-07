import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ExecutionStatus } from '../enum/release-execution.enum';
import { ReleaseExecution } from './release-execution.entity';
import { ReleaseExecutionStep } from './release-execution-step.entity';

@Entity('release_execution_dsps')
export class ReleaseExecutionDsp extends BaseUUIDEntity {
    @Column({ name: 'execution_id', type: 'uuid' })
    executionId: string;

    @ManyToOne(() => ReleaseExecution, execution => execution.executionDsps, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'execution_id' })
    execution: ReleaseExecution;

    @Column({ name: 'dsp_id', type: 'varchar', length: 10 })
    dspId: string;

    @ManyToOne(() => Dsp, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'dsp_id' })
    dsp: Dsp;

    @Column({ type: 'enum', enum: ExecutionStatus, default: ExecutionStatus.QUEUED })
    status: ExecutionStatus;

    @Column({ type: 'text', nullable: true })
    logs: string | null;
    
    @OneToMany(() => ReleaseExecutionStep, step => step.executionDsp)
    steps: ReleaseExecutionStep[];
}
