import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUUID } from 'src/database/entities/database.entity';
import { Permission } from 'src/permission/entities/permission.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('user_permissions')
export class UserPermission extends BaseEntityUUID {
	@Column({ name: 'user_id', type: 'varchar', length: LENGTH_ID.USER })
	userId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({
		name: 'permission_id',
		type: 'varchar',
		length: LENGTH_ID.PERMISSION,
	})
	permissionId: string;

	@ManyToOne(() => Permission)
	@JoinColumn({ name: 'permission_id' })
	permission: Permission;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
