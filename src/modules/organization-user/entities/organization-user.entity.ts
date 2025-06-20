import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('organization_user')
export class OrganizationUser extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid' })
	userId: string;

	@OneToOne(() => User)
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ type: 'uuid' })
	organizationId: string;

	@ManyToOne(() => Organization)
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;
}
