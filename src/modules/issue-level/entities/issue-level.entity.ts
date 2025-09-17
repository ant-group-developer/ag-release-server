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

@Entity('issue_level')
export class IssueLevel extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameVi: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameEn: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_COLOR })
	color: string;

	@Column({ type: 'int', default: 1, comment: '1 = lowest severity' })
	severityRank: number;

	@Column({
		type: 'numeric',
		precision: 5,
		scale: 2,
		comment: 'Score multiplier',
		transformer: {
			to: (value: number) => value,
			from: (value: string | null) =>
				value !== null ? parseFloat(value) : null,
		},
	})
	weight: number;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	note: string | null;

	// virtual
	issuesCount?: number;

	// user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// relation
	@OneToMany(() => Issue, (issue) => issue.issueLevel)
	issues: Issue[];
}
