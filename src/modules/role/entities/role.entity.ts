// role.entity.ts
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { RolePermission } from './role-permission.entity';

@Entity('roles')
export class Role extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 50, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	color: string;

	@Column({ type: 'varchar', length: 1000, nullable: true })
	note: string | null;

	// relation
	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.role, {
		cascade: true,
	})
	rolePermissions: RolePermission[];
}
