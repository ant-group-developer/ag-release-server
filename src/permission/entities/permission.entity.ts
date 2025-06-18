import { BaseEntityUserCreatorLongId } from 'src/database/entities/database.entity';
import { UserPermission } from 'src/user-permission/entities/user-permission.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('permissions')
export class Permission extends BaseEntityUserCreatorLongId {
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
