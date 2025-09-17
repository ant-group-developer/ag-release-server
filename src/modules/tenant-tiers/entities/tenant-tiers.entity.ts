import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_COLOR,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('tenant_tiers')
export class TenantTier extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameVi: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	nameEn: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({ type: 'int', default: 0 })
	minScore: number;

	@Column({ type: 'int', default: 0 })
	maxScore: number;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	note: string | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_COLOR })
	color: string;

	// user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => Tenant, (tenant) => tenant.tenantTier)
	tenants: Tenant[];
}
