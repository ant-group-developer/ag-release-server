// role.entity.ts
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { DEFAULT_LENGTH_NAME, DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';

@Entity('roles')
export class Role extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	color: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	note: string | null;

	// relation
	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.role, {
		cascade: true,
	})
	rolePermissions: RolePermission[];
}
