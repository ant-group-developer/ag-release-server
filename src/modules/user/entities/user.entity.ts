import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { OrganizationUser } from 'src/modules/organization-user/entities/organization-user.entity';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { UserPermission } from 'src/modules/user-permission/entities/user-permission.entity';
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
export class User extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	email: string;

	@Column({ type: 'varchar', nullable: true })
	telegramId: string | null;

	@Column({ type: 'varchar', nullable: true })
	avatar: string | null;

	@Column({ type: 'enum', enum: UserType, default: UserType.USER })
	type: UserType;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@Column({ select: false, default: '' })
	password: string;

	@Column({ default: false, name: 'email_verified' })
	emailVerified: boolean;

	@Column({ name: 'auth0_user_id', nullable: true })
	auth0UserId: string;

	@Column({ name: 'last_login', nullable: true })
	lastLogin: Date;

	@Column({ name: 'last_ip', nullable: true })
	lastIp: string;

	@Column({ name: 'logins_count', default: 0 })
	loginsCount: number;

	@OneToMany(() => UserPermission, (userPermission) => userPermission.user)
	userPermissions: UserPermission[];

	@OneToOne(() => Organization, (organization) => organization.owner)
	organization: Organization | null;

	@OneToOne(
		() => OrganizationUser,
		(organizationUser) => organizationUser.user,
	)
	organizationUser: OrganizationUser | null;

	@Column({ type: 'uuid', nullable: true })
	creatorId: string;

	@Column({ type: 'uuid', nullable: true })
	modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;
}
