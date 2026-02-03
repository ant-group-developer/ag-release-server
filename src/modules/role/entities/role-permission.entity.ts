import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Permission } from 'src/modules/permission/entities/permission.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Role } from './role.entity';

@Entity('role_permission', {
	comment: 'Bảng liên kết giữa role và permission trong hệ thống phân quyền',
})
export class RolePermission extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID của role',
	})
	roleId: string;

	@Column({
		type: 'uuid',
		comment: 'ID của permission',
	})
	permissionId: string;

	@ManyToOne(() => Role, (role) => role.rolePermissions)
	@JoinColumn({ name: 'role_id' })
	role: Role;

	@ManyToOne(() => Permission)
	@JoinColumn({ name: 'permission_id' })
	permission: Permission;
}
