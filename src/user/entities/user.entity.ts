import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUserCreatorUUID } from 'src/database/entities/database.entity';
import { OrganizationUser } from 'src/organization-user/entities/organization-user.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { UserPermission } from 'src/user-permission/entities/user-permission.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { UserType } from '../enum/user.enum';

@Entity('users')
export class User extends BaseEntityUserCreatorUUID {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	email: string;

	@Column({ type: 'enum', enum: UserType, default: UserType.USER })
	type: UserType;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@OneToMany(() => UserPermission, (userPermission) => userPermission.user)
	userPermissions: UserPermission[];

	@OneToOne(() => Organization, (organization) => organization.owner)
	organization: Organization;

	@OneToOne(
		() => OrganizationUser,
		(organizationUser) => organizationUser.user,
	)
	organizationUser: OrganizationUser;

	@Column({ name: 'creator_id', length: LENGTH_ID.USER })
	creatorId: string;

	@Column({ name: 'modifier_id', length: LENGTH_ID.USER })
	modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
