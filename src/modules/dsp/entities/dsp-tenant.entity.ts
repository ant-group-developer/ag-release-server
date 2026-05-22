import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { SftpConfig } from 'src/modules/distribution/sftp-configs/entities/sftp-config.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToOne,
	Unique,
} from 'typeorm';
import { Dsp } from './dsp.entity';

export enum DspAgreementModeEnum {
	SYSTEM = 'SYSTEM',
	DIRECT = 'DIRECT',
}

@Entity({ name: 'tenant_dsp_agreements' })
@Unique('uq_tenant_dsp_agreement_tenant_dsp', ['tenantId', 'dspId'])
export class TenantDspAgreement extends BaseUUIDEntity {
	@Column({ type: 'uuid', name: 'tenant_id' })
	tenantId: string;

	@Column({ type: 'varchar', length: 10, name: 'dsp_id' })
	dspId: string;

	@Column({ type: 'uuid', name: 'sftp_config_id', nullable: true })
	sftpConfigId: string | null;

	@Column({
		type: 'enum',
		enum: DspAgreementModeEnum,
		default: DspAgreementModeEnum.SYSTEM,
	})
	mode: DspAgreementModeEnum;

	@Column({ type: 'boolean', name: 'is_active', default: true })
	isActive: boolean;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Dsp, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@OneToOne(() => SftpConfig, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'sftp_config_id' })
	sftpConfig: SftpConfig | null;
}
