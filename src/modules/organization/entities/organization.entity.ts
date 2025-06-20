import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { OrganizationDsp } from 'src/modules/organization-dsp/entities/organization-dsp.entity';
import { OrganizationUser } from 'src/modules/organization-user/entities/organization-user.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, OneToMany, OneToOne } from 'typeorm';

@Entity('organizations')
export class Organization extends BaseUUIDEntity {
	@Column({ name: 'logo', type: 'varchar', length: 100 })
	logo: string;

	@Column({ name: 'icon', type: 'varchar', length: 100 })
	icon: string;

	// Example: ANT Music
	@Column({ name: 'name', type: 'varchar', length: 100 })
	name: string;

	// Example: ANT Music - Distribution Unlimited Music All Platform
	@Column({ name: 'title', type: 'varchar', length: 100 })
	title: string;

	// The domain must be without http:// or https://
	@Column({ name: 'domain', type: 'varchar', length: 50 })
	domain: string;

	// This email will be used to send notifications
	@Column({ name: 'email', type: 'varchar', length: 50 })
	email: string;

	// Example: #4540BF
	@Column({ name: 'primary_color', type: 'varchar', length: 10 })
	primaryColor: string;

	@Column({ name: 'owner_id', type: 'uuid' })
	ownerId: string;

	@OneToOne(() => User, (User) => User.organization)
	owner: User;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@OneToMany(() => OrganizationDsp, (organizationDsp) => organizationDsp.dsp)
	organizationDsps: OrganizationDsp[];

	@OneToMany(
		() => OrganizationUser,
		(organizationUser) => organizationUser.organization,
	)
	organizationUsers: OrganizationUser[];
}
