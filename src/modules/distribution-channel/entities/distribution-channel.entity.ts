import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { DistributionChannelCredentialsDto } from '../dto/distribution-channel.dto';
import { Aggregator } from './aggregator.entity';

@Entity('distribution_channels', {
	comment:
		'Kênh phân phối: tenant phân phối nội dung lên DSP thông qua aggregator với cấu hình kết nối riêng',
})
export class DistributionChannel extends BaseUserTrackedUUIDEntity {
	// =========================
	// RELATIONS
	// =========================

	// @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
	// tenantId: string | null;

	// @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
	// @JoinColumn({ name: 'tenant_id' })
	// tenant: Tenant | null;

	// @Column({
	// 	type: 'varchar',
	// 	length: 10,
	// 	name: 'dsp_id',
	// 	nullable: true,
	// })
	// dspId: string | null;

	// @ManyToOne(() => Dsp, { onDelete: 'RESTRICT', nullable: true })
	// @JoinColumn({ name: 'dsp_id' })
	// dsp: Dsp | null;

	@Column({ type: 'uuid', name: 'aggregator_id', nullable: true })
	aggregatorId: string | null;

	@OneToOne(() => Aggregator, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'aggregator_id' })
	aggregator: Aggregator | null;

	// =========================
	// CONFIG
	// =========================

	// @Column({
	// 	type: 'varchar',
	// 	length: 20,
	// 	comment: 'Giao thức kết nối: FTP | SFTP | API',
	// })
	// protocol: string;

	@Column({
		type: 'jsonb',
		nullable: false,
		comment:
			'Thông tin xác thực kết nối (username, password, key, token, path...)',
	})
	credentials: DistributionChannelCredentialsDto | null;

	// @Column({
	// 	type: 'boolean',
	// 	name: 'is_system_default',
	// 	default: false,
	// 	comment: 'Kênh mặc định do hệ thống cấu hình',
	// })
	// isSystemDefault: boolean;

	// @Column({
	// 	type: 'boolean',
	// 	name: 'is_active',
	// 	default: true,
	// 	comment: 'Kênh phân phối đang hoạt động hay không',
	// })
	// isActive: boolean;

	// @Column({
	// 	type: 'enum',
	// 	enum: DspAgreementType,
	// 	name: 'agreement_type',
	// })
	// agreementType: DspAgreementType;
}

// sql
// CREATE TABLE distribution_channels (
//     id uuid PRIMARY KEY,

//     tenant_id uuid NOT NULL,
//     dsp_id varchar(10) NOT NULL,
//     aggregator_id uuid NULL,

//     protocol varchar(20) NOT NULL,
//     credentials jsonb NOT NULL,

//     is_system_default boolean NOT NULL DEFAULT false,
//     is_active boolean NOT NULL DEFAULT true,

//     creator_id uuid NOT NULL,
//     modifier_id uuid NOT NULL,

//     created_at timestamptz NOT NULL DEFAULT now(),
//     updated_at timestamptz NOT NULL DEFAULT now(),

//     CONSTRAINT uq_distribution_channels
//         UNIQUE (tenant_id, dsp_id, aggregator_id),

//     CONSTRAINT fk_distribution_channels_tenant
//         FOREIGN KEY (tenant_id)
//         REFERENCES tenants (id)
//         ON DELETE CASCADE,

//     CONSTRAINT fk_distribution_channels_dsp
//         FOREIGN KEY (dsp_id)
//         REFERENCES dsps (id)
//         ON DELETE RESTRICT,

//     CONSTRAINT fk_distribution_channels_aggregator
//         FOREIGN KEY (aggregator_id)
//         REFERENCES aggregators (id)
//         ON DELETE SET NULL
// );
