import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { TenantRole } from 'src/modules/tenant-roles/tenant-role.entity';
import { UserRole } from 'src/modules/user-role/user-role.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { RolePermission } from './role-permission.entity';

@Entity('roles', {
	comment: 'Danh mục vai trò (role) dùng trong hệ thống phân quyền',
})
export class Role extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên vai trò',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Màu hiển thị đại diện cho vai trò',
	})
	color: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		comment: 'Mã vai trò dùng trong hệ thống',
	})
	code: string;

	@Column({
		name: 'is_active',
		type: 'boolean',
		default: true,
		comment: 'Trạng thái hoạt động của vai trò',
	})
	isActive: boolean;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Ghi chú hoặc mô tả thêm cho vai trò',
	})
	note: string | null;

	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.role, {
		cascade: true,
	})
	rolePermissions: RolePermission[];

	@OneToMany(() => UserRole, (userRole) => userRole.role)
	userRoles: UserRole[];

	@OneToMany(() => TenantRole, (tenantRole) => tenantRole.role)
	tenantRoles: TenantRole[];
}
