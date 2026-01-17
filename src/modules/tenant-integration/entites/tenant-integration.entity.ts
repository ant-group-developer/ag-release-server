import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { DspAgreementType } from 'src/modules/distribution-channel/enums/distribution-channel.enum';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	Unique,
} from 'typeorm';
import { Dsp } from '../../dsp/entities/dsp.entity';
import { Tenant } from '../../tenant/tenant.entity';

@Entity('tenant_integrations', {
	comment: 'Bảng cấu hình DSP tenant',
})
@Unique('uq_ti_tenant_dsp', ['tenantId', 'dspId'])
export class TenantIntegration extends BaseUserTrackedUUIDEntity {
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

	@Column({
		type: 'enum',
		enum: DspAgreementType,
		name: 'agreement_type',
		default: DspAgreementType.ANT,
	})
	agreementType: DspAgreementType;

	@ManyToOne(() => Dsp, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@ManyToOne(() => Tenant, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@OneToMany(() => TenantIntegrationConnection, (c) => c.tenantIntegration)
	connections: TenantIntegrationConnection[];
}

export type ConnectionCredentials = {
	host: string | null;
	port: number | null;
	username: string | null;
	password: string | null;
};

@Entity('tenant_integration_connections')
@Unique('uq_tic_ti_agreement', ['tenantIntegrationId', 'agreementType'])
export class TenantIntegrationConnection extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid', name: 'tenant_integration_id' })
	tenantIntegrationId: string;

	@ManyToOne(() => TenantIntegration, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_integration_id' })
	tenantIntegration: TenantIntegration;

	@Column({ type: 'varchar', length: 50 })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({
		type: 'boolean',
		name: 'requires_credentials',
		default: false,
		comment: 'Agreement này có yêu cầu nhập thông tin kết nối hay không',
	})
	requiresCredentials: boolean;

	@Column({
		type: 'enum',
		enum: DspAgreementType,
		name: 'agreement_type',
	})
	agreementType: DspAgreementType;

	@Column({ type: 'varchar', length: 20, nullable: true })
	protocol: string | null;

	@Column({ type: 'jsonb', nullable: true })
	credentials: ConnectionCredentials | null;
}
