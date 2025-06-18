import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Permission } from 'src/permission/entities/permission.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('user_permissions')
export class UserPermission extends BaseEntityLongId {
	@Column({ name: 'user_id', type: 'varchar', length: LENGTH_ID.USER })
	userId: string;

	@ManyToOne(() => UserEntity)
	@JoinColumn({ name: 'user_id' })
	user: UserEntity;

	@Column({
		name: 'permission_id',
		type: 'varchar',
		length: LENGTH_ID.PERMISSION,
	})
	permissionId: string;

	@ManyToOne(() => Permission)
	@JoinColumn({ name: 'permission_id' })
	permission: Permission;
}
