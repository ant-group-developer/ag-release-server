import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_COLOR,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('issue_level', {
	comment: 'Danh mục cấp độ issue, dùng để phân loại mức độ nghiêm trọng',
})
export class IssueLevel extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên cấp độ issue (tiếng Việt)',
	})
	nameVi: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên cấp độ issue (tiếng Anh)',
	})
	nameEn: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã cấp độ issue duy nhất',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_COLOR,
		comment: 'Màu hiển thị đại diện cho cấp độ issue',
	})
	color: string;

	@Column({
		type: 'int',
		default: 1,
		comment: 'Thứ hạng mức độ nghiêm trọng (1 = thấp nhất)',
	})
	severityRank: number;

	@Column({
		type: 'numeric',
		precision: 5,
		scale: 2,
		comment: 'Hệ số nhân điểm cho issue thuộc cấp độ này',
		transformer: {
			to: (value: number) => value,
			from: (value: string | null) =>
				value !== null ? parseFloat(value) : null,
		},
	})
	weight: number;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Ghi chú mô tả thêm cho cấp độ issue',
	})
	note: string | null;

	issuesCount?: number;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@OneToMany(() => Issue, (issue) => issue.issueLevel)
	issues: Issue[];
}
