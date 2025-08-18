import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { User } from 'src/modules/user/entities/user.entity';

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('organization_dsp')
export class OrganizationDsp extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid' })
	dspId: string;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'uuid' })
	organizationId: string;

	// relation
	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

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
