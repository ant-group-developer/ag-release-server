import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Tenant } from '../tenant/tenant.entity';

@Entity('tenant_dsp', {
	comment: 'Bảng cấu hình DSP được kích hoạt cho từng tenant',
})
export class TenantDsp extends BaseUUIDEntity {
	@Column({
		type: 'boolean',
		default: true,
		comment: 'Trạng thái kích hoạt DSP cho tenant',
	})
	isActive: boolean;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID của DSP',
	})
	dspId: string;

	@Column({
		type: 'uuid',
		comment: 'ID của tenant',
	})
	tenantId: string;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;
}
