import { BaseEntityUserCreatorLongId } from 'src/database/entities/database.entity';
import { Organization } from 'src/organization/entitites/organization.entity';
import { OrganizationUser } from 'src/organizitaion-user/entities/organizitaion-user.entity';
import { UserPermission } from 'src/user-permission/entities/user-permission.entity';
import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { UserType } from '../enum/user.enum';

@Entity('users')
export class UserEntity extends BaseEntityUserCreatorLongId {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	email: string;

	@Column({ type: 'enum', enum: UserType, default: UserType.USER })
	type: UserType;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@OneToMany(() => UserPermission, (userPermission) => userPermission.user)
	userPermission: UserPermission[];

	@OneToOne(() => Organization, (organization) => organization.owner)
	organization: Organization;

	@OneToOne(
		() => OrganizationUser,
		(organizationUser) => organizationUser.user,
	)
	organizationUser: OrganizationUser;
}
