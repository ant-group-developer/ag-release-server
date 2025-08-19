import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { UserRole } from 'src/modules/user-role/user-role.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { UserType } from '../enum/user.enum';
import { TenantUser } from './tenant-user.entity';

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

	@Column({ name: 'last_login', nullable: true })
	lastLogin: Date;

	@Column({ name: 'last_active', nullable: true })
	lastActive: Date;

	@Column({ name: 'last_ip', nullable: true })
	lastIp: string;

	@Column({ name: 'logins_count', default: 0 })
	loginsCount: number;

	@OneToMany(() => UserRole, (userRole) => userRole.user)
	userRoles: UserRole[];

	@OneToMany(() => TenantUser, (tenantUser) => tenantUser.user)
	tenantUser: TenantUser[];

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
