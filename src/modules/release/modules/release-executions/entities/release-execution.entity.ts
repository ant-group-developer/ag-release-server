import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ExecutionStatus, ExecutionType } from '../enum/release-execution.enum';
import { ReleaseExecutionDsp } from './release-execution-dsp.entity';

@Entity('release_executions')
export class ReleaseExecution extends BaseUUIDEntity {
    @Column({ name: 'release_id', type: 'uuid', comment: 'ID của Release đang được phân phối' })
    releaseId: string;

    @ManyToOne(() => Release, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'release_id' })
    release: Release;

    @Column({ type: 'enum', enum: ExecutionType, comment: 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)' })
    type: ExecutionType;

    @Column({ type: 'enum', enum: ExecutionStatus, default: ExecutionStatus.QUEUED, comment: 'Trạng thái tổng thể của nguyên đợt phân phối này' })
    status: ExecutionStatus;

    @Column({ type: 'varchar', array: true, nullable: true, comment: 'Mảng lưu lại danh sách Dsp Codes lúc submit để history đối chiếu' })
    originalDspCodes: string[] | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'triggered_by_id' })
    triggeredBy: User | null;

    @Column({ name: 'triggered_by_id', type: 'uuid', nullable: true, comment: 'ID của admin bấm nút submit (để trace)' })
    triggeredById: string | null;

    @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true, comment: 'Thời gian Worker bắt đầu gắp job này ra xử lý' })
    startedAt: Date | null;

    @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true, comment: 'Thời gian hoàn tất xử lý tất cả các DSP' })
    completedAt: Date | null;

    @Column({ type: 'text', nullable: true, comment: 'Báo cáo tổng hợp/Ghi chú lỗi nếu quá trình tổng thể bị văng' })
    summary: string | null;

    @OneToMany(() => ReleaseExecutionDsp, dsp => dsp.execution)
    executionDsps: ReleaseExecutionDsp[];
}
