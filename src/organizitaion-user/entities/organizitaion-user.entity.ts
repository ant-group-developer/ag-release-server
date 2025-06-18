import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Organization } from 'src/organization/entitites/organization.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('organization_user')
export class OrganizationUser extends BaseEntityLongId {
	@Column({ name: 'user_id', type: 'uuid' })
	userId: string;

	@OneToOne(() => UserEntity)
	@JoinColumn({ name: 'user_id' })
	user: UserEntity;

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
