import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUserCreatorUUID } from 'src/database/entities/database.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('organization_user')
export class OrganizationUser extends BaseEntityUserCreatorUUID {
	@Column({ name: 'user_id', type: 'varchar', length: LENGTH_ID.USER })
	userId: string;

	@OneToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	// @Column({
	// 	name: 'organization_id',
	// 	type: 'varchar',
	// 	length: LENGTH_ID.ORGANIZATION,
	// })
	@Column('uuid')
	organizationId: string;

	@ManyToOne(() => Organization)
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
