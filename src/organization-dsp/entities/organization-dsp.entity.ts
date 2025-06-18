import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Dsp } from 'src/dsp/entitites/dsp.entity';
import { Organization } from 'src/organization/entitites/organization.entity';

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('organization_dsp')
export class OrganizationDsp extends BaseEntityLongId {
	@Column({ name: 'dsp_id', type: 'varchar', length: LENGTH_ID.DSP })
	dspId: string;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@Column({
		name: 'organization_id',
		type: 'varchar',
		length: LENGTH_ID.ORGANIZATION,
	})
	organizationId: string;

	@ManyToOne(() => Organization)
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;
}
