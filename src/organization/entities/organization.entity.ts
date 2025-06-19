import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { OrganizationDsp } from 'src/organization-dsp/entities/organization-dsp.entity';
import { OrganizationUser } from 'src/organization-user/entities/organization-user.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, OneToMany, OneToOne } from 'typeorm';

@Entity('organizations')
export class Organization extends BaseEntityLongId {
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

	@Column({ name: 'owner_id', type: 'varchar', length: LENGTH_ID.USER })
	ownerId: string;

	@OneToOne(() => User, (User) => User.organization)
	owner: User;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@OneToMany(() => OrganizationDsp, (OrganizationDsp) => OrganizationDsp.dsp)
	organizationDsps: OrganizationDsp[];

	@OneToMany(
		() => OrganizationUser,
		(organizationUser) => organizationUser.organization,
	)
	organizationUsers: OrganizationUser[];
}
