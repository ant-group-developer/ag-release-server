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

@Entity('issues')
export class Issue extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameVi: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameEn: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Base score (can be overridden per tenant_issue)',
	})
	score: number;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Default duration impact (days)',
	})
	numberOfDaysAffect: number | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	description: string | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	note: string | null;

	@Column({ type: 'uuid' })
	issueLevelId: string;

	// user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// relation
	@ManyToOne(() => IssueLevel, (issueLevel) => issueLevel.issues)
	@JoinColumn({ name: 'issue_level_id' })
	issueLevel: IssueLevel;

	@OneToMany(() => TenantIssue, (tenantIssue) => tenantIssue.issue)
	tenantIssues: TenantIssue[];
}
