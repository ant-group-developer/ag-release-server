import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Dsp } from 'src/dsp/entities/dsp.entity';
import { Organization } from 'src/organization/entities/organization.entity';

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

console.log('organization_dsp')

@Entity('organization_dsp')
export class OrganizationDsp extends BaseEntityLongId {
	@Column({ name: 'dsp_id', type: 'varchar', length: LENGTH_ID.DSP })
	dspId: string;

	// @PrimaryColumn({
	// 	type: 'varchar',
	// 	length: LENGTH_ID.BASE_LONG,
	// })
	// id: string;

	// @ManyToOne(() => Dsp)
	// @JoinColumn({ name: 'dsp_id' })
	// dsp: Dsp;

	@Column({
		name: 'organization_id',
		type: 'varchar',
		length: LENGTH_ID.ORGANIZATION,
	})
	organizationId: string;

	// // @ManyToOne(() => Organization)
	// // @JoinColumn({ name: 'organization_id' })
	// // organization: Organization;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;
}
