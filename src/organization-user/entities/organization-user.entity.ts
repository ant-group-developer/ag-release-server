import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

console.log('organization_user')

@Entity('organization_user')
export class OrganizationUser extends BaseEntityLongId {
	@Column({ name: 'user_id', type: 'varchar', length: LENGTH_ID.USER })
	userId: string;

	@OneToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({
		name: 'organization_id',
		type: 'varchar',
		length: LENGTH_ID.ORGANIZATION,
	})
	organizationId: string;

	@ManyToOne(() => Organization)
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;
}
