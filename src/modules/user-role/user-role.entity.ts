import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Role } from '../role/entities/role.entity';
import { Tenant } from '../tenant/tenant.entity';
import { User } from '../user/entities/user.entity';

@Entity('user_role', {
	comment: 'Bảng gán role cho user theo từng tenant (RBAC đa tenant)',
})
export class UserRole extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID người dùng',
	})
	userId: string;

	@Column({
		type: 'uuid',
		comment: 'ID vai trò được gán',
	})
	roleId: string;

	@Column({
		type: 'uuid',
		comment: 'ID tenant mà role này có hiệu lực',
	})
	tenantId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	@ManyToOne(() => Role)
	@JoinColumn({ name: 'role_id' })
	role: Role;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;
}
