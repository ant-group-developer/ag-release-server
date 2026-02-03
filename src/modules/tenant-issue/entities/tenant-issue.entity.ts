import { DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('tenant_issue', {
	comment: 'Bảng cấu hình issue áp dụng riêng cho từng tenant',
})
export class TenantIssue extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'int',
		default: 0,
		comment:
			'Điểm override cho issue; nếu = 0 thì dùng issue.score mặc định',
	})
	score: number;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm bắt đầu ảnh hưởng đến điểm',
	})
	startDateAffect: Date | null;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm kết thúc ảnh hưởng; NULL = đang áp dụng',
	})
	endDateAffect: Date | null;

	@Column({
		type: 'boolean',
		default: true,
		comment: 'Trạng thái kích hoạt issue cho tenant',
	})
	isActive: boolean;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Mô tả chi tiết issue cho tenant',
	})
	description: string | null;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Ghi chú nội bộ cho tenant issue',
	})
	note: string | null;

	@Column({
		type: 'uuid',
		comment: 'ID tenant',
	})
	tenantId: string;

	@Column({
		type: 'uuid',
		comment: 'ID issue',
	})
	issueId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@ManyToOne(() => Tenant, (tenant) => tenant.tenantIssues, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Issue, (issue) => issue.tenantIssues, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'issue_id' })
	issue: Issue;
}
