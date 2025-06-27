import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { OrganizationDsp } from 'src/modules/organization-dsp/entities/organization-dsp.entity';
import { OrganizationUser } from 'src/modules/organization-user/entities/organization-user.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';

@Entity('organizations')
export class Organization extends BaseUUIDEntity {
	@Column({
		name: 'logo',
		type: 'varchar',
		length: 100,
		comment: 'Logo of the organization',
	})
	logo: string;

	@Column({
		name: 'icon',
		type: 'varchar',
		length: 100,
		comment: 'Icon of the organization',
	})
	icon: string;

	@Column({
		name: 'name',
		type: 'varchar',
		length: 100,
		comment: 'Example: ANT Music',
	})
	name: string;

	@Column({
		name: 'title',
		type: 'varchar',
		length: 100,
		comment:
			'Example: ANT Music - Distribution Unlimited Music All Platform',
	})
	title: string;

	@Column({
		name: 'domain',
		type: 'varchar',
		length: 50,
		comment: 'The domain must be without http:// or https://',
	})
	domain: string;

	@Column({
		name: 'email',
		type: 'varchar',
		length: 50,
		comment: 'This email will be used to send notifications',
	})
	email: string;

	@Column({
		name: 'primary_color',
		type: 'varchar',
		length: 10,
		comment: 'Example: #4540BF',
	})
	primaryColor: string;

	@Column({
		name: 'owner_id',
		type: 'uuid',
		comment: 'ID of the organization owner',
	})
	ownerId: string;

	@OneToOne(() => User, (user) => user.organization)
	owner: User;

	@Column({
		name: 'is_active',
		type: 'boolean',
		default: true,
		comment: 'Indicates if the organization is active',
	})
	isActive: boolean;

	@OneToMany(() => OrganizationDsp, (organizationDsp) => organizationDsp.dsp)
	organizationDsps: OrganizationDsp[];

	@OneToMany(
		() => OrganizationUser,
		(organizationUser) => organizationUser.organization,
	)
	organizationUsers: OrganizationUser[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
