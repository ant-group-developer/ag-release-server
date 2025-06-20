import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Permission } from 'src/modules/permission/entities/permission.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('user_permissions')
export class UserPermission extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid' })
	userId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ type: 'uuid' })
	permissionId: string;

	@ManyToOne(() => Permission)
	@JoinColumn({ name: 'permission_id' })
	permission: Permission;
}
