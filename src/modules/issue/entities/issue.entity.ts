import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { TenantIssue } from 'src/modules/tenant-issue/entities/tenant-issue.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { IssueLevel } from '../../issue-level/entities/issue-level.entity';

@Entity('issues', {
	comment: 'Danh mục các issue / lỗi / vi phạm dùng để đánh giá và chấm điểm',
})
export class Issue extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên issue bằng tiếng Việt',
	})
	nameVi: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên issue bằng tiếng Anh',
	})
	nameEn: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã issue duy nhất trong hệ thống',
	})
	code: string;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Điểm cơ bản của issue (có thể bị override theo tenant)',
	})
	score: number;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Số ngày ảnh hưởng mặc định của issue',
	})
	numberOfDaysAffect: number | null;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Mô tả chi tiết về issue',
	})
	description: string | null;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Ghi chú bổ sung cho issue',
	})
	note: string | null;

	@Column({
		type: 'uuid',
		comment: 'ID cấp độ issue (issue level)',
	})
	issueLevelId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@ManyToOne(() => IssueLevel, (issueLevel) => issueLevel.issues)
	@JoinColumn({ name: 'issue_level_id' })
	issueLevel: IssueLevel;

	@OneToMany(() => TenantIssue, (tenantIssue) => tenantIssue.issue)
	tenantIssues: TenantIssue[];
}
