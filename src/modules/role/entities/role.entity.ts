// role.entity.ts
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { UserRole } from 'src/modules/user-role/user-role.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { RolePermission } from './role-permission.entity';

@Entity('roles')
export class Role extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	color: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE })
	code: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	note: string | null;

	// relation
	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.role, {
		cascade: true,
	})
	rolePermissions: RolePermission[];

	// relation
	@OneToMany(() => UserRole, (userRole) => userRole.role)
	userRoles: UserRole[];
}
