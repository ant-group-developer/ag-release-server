// role-permission.entity.ts
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Permission } from 'src/modules/permission/entities/permission.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Role } from './role.entity';

@Entity('role_permission')
export class RolePermission extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	roleId: string;

	@Column({ type: 'uuid' })
	permissionId: string;

	// relation
	@ManyToOne(() => Role, (role) => role.rolePermissions)
	@JoinColumn({ name: 'role_id' })
	role: Role;

	@ManyToOne(() => Permission)
	@JoinColumn({ name: 'permission_id' })
	permission: Permission;
}
