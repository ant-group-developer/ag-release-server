import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { UserPermission } from 'src/modules/user-permission/entities/user-permission.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('permissions')
export class Permission extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 50, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	value: string;

	@Column({ type: 'varchar', length: 1000, nullable: true })
	note: string | null;

	// relation
	@OneToMany(
		() => UserPermission,
		(userPermission) => userPermission.permission,
	)
	userPermissions: UserPermission[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// virtual column
	userCount?: number;
}
