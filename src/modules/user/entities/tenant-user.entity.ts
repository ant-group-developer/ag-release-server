import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Tenant } from '../../tenant/tenant.entity';
import { TenantUserType } from '../enum/user.enum';
import { User } from './user.entity';

@Entity('tenant_user')
export class TenantUser extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'enum',
		enum: TenantUserType,
		default: TenantUserType.MEMBER,
	})
	type: TenantUserType;

	@Column({ type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ type: 'uuid' })
	userId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	// @Column({ type: 'uuid', nullable: true })
	// creatorId: string;

	// @Column({ type: 'uuid', nullable: true })
	// modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;
}
