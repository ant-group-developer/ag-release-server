import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { UserPermission } from 'src/modules/user-permission/entities/user-permission.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('permissions')
export class Permission extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 50 })
	name: string;

	@Column({ type: 'varchar', length: 50 })
	value: string;

	@OneToMany(
		() => UserPermission,
		(userPermission) => userPermission.permission,
	)
	userPermissions: UserPermission[];
}
