import { BaseEntityUserCreatorUUID } from 'src/database/entities/database.entity';
import { Dsp } from 'src/dsp/entities/dsp.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/user/entities/user.entity';

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('organization_dsp')
export class OrganizationDsp extends BaseEntityUserCreatorUUID {
	// @Column({ name: 'dsp_id', type: 'varchar', length: LENGTH_ID.DSP })
	@Column('uuid')
	dspId: string;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

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

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
