import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Tenant } from '../tenant/tenant.entity';

@Entity('tenant_dsp')
export class TenantDsp extends BaseUUIDEntity {
	@Column({ default: true })
	isActive: boolean;

	@Column({ type: 'varchar', length: 10 })
	dspId: string;

	@Column({ type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;
}
