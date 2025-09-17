import { DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('tenant_issue')
export class TenantIssue extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'int', default: 0, comment: 'If 0, use issues.score' })
	score: number;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'When it starts impacting score',
	})
	startDateAffect: Date | null;

	@Column({ type: 'timestamptz', nullable: true, comment: 'NULL = ongoing' })
	endDateAffect: Date | null;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	description: string | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	note: string | null;

	@Column({ type: 'uuid' })
	tenantId: string;

	@Column({ type: 'uuid' })
	issueId: string;

	// user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// relation
	@ManyToOne(() => Tenant, (tenant) => tenant.tenantIssues)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Issue, (issue) => issue.tenantIssues)
	@JoinColumn({ name: 'issue_id' })
	issue: Issue;
}
