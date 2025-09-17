import { Expose, Type } from 'class-transformer';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	Tree,
	TreeChildren,
	TreeParent,
} from 'typeorm';
import { LENGTH_PICTURE } from '../database/constants/database.constants';
import { TenantDsp } from '../tenant-dsp/tenant-dsp.entity';
import { TenantIssue } from '../tenant-issue/entities/tenant-issue.entity';
import { TenantTier } from '../tenant-tiers/entities/tenant-tiers.entity';
import { TenantUser } from '../user/entities/tenant-user.entity';
import { User } from '../user/entities/user.entity';
import { TenantType } from './tenant.enum';

@Entity({ name: 'tenants' })
@Tree('closure-table')
export class Tenant extends BaseUserTrackedUUIDEntity {
	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment:
			'Example: https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	logo: string;

	@Column({ type: 'smallint', name: 'max_labels' })
	maxLabels: number;

	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment:
			'Example: https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	icon: string;

	@Column({
		length: 100,
		nullable: true,
		comment:
			'Example: ANT Music - Distribution Unlimited Music All Platform',
	})
	title: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'ANT Music',
	})
	name: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'The domain must be without http:// or https://',
	})
	domain: string;

	@Column({
		length: 50,
		comment: 'This email will be used to send notifications',
	})
	email: string;

	@Column({
		length: 10,
		comment: 'Example: #4540BF',
		nullable: true,
	})
	primaryColor: string;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'enum', enum: TenantType, default: TenantType.LABEL })
	type: TenantType;

	@Column({ type: 'uuid', nullable: true })
	tenantTierId: string | null;

	// relation
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'owner_id' })
	owner: User;

	@TreeParent({ onDelete: 'CASCADE' })
	@JoinColumn({ name: 'parent_id' })
	@Expose()
	@Type(() => Tenant)
	parent: Tenant | null;

	@TreeChildren({ cascade: true })
	@Expose()
	@Type(() => Tenant)
	children: Tenant[];

	@OneToMany(() => TenantUser, (tenantUser) => tenantUser.tenant)
	tenantUser: TenantUser[];

	@OneToMany(() => TenantDsp, (tenantDsp) => tenantDsp.tenant)
	tenantDsp: TenantDsp[];

	@OneToMany(() => TenantIssue, (tenantIssue) => tenantIssue.tenant)
	tenantIssues: TenantIssue[];

	@OneToMany(() => TenantTier, (tenantTier) => tenantTier.tenants)
	@JoinColumn({ name: 'tenant_tier_id' })
	tenantTier: TenantTier[];
}
