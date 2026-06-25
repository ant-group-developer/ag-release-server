import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
} from 'typeorm';
import { BaseUserTrackedUUIDEntity } from '../../../common/entities/user-tracked.entity';
import { Tenant } from '../../tenant/tenant.entity';

export enum DomainStatus {
	PENDING = 'pending',
	VERIFYING = 'verifying',
	ACTIVE = 'active',
	FAILED = 'failed',
	EXPIRED = 'expired',
}

export enum SslStatus {
	PENDING = 'pending',
	INITIALIZING = 'initializing',
	ACTIVE = 'active',
	FAILED = 'failed',
}

export enum DomainSetupMode {
	CLOUDFLARE_AUTO = 'cloudflare_auto',
	MANUAL = 'manual',
}

@Entity('tenant_domains', {
	comment: 'Custom domain của từng tenant',
})
export class TenantDomain extends BaseUserTrackedUUIDEntity {
	@Column({ length: 253, unique: true, comment: 'Domain name, vd: release.betamusic.net' })
	domain: string;

	@Column({ type: 'uuid', unique: true, comment: '1 tenant = 1 domain (v1)' })
	tenantId: string;

	@ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({
		type: 'enum',
		enum: DomainStatus,
		default: DomainStatus.PENDING,
	})
	status: DomainStatus;

	@Column({
		type: 'enum',
		enum: DomainSetupMode,
		default: DomainSetupMode.MANUAL,
	})
	setupMode: DomainSetupMode;

	@Column({ type: 'varchar', length: 255, nullable: true, comment: 'Cloudflare SaaS custom hostname ID' })
	cfCustomHostnameId: string | null;

	@Column({
		type: 'enum',
		enum: SslStatus,
		default: SslStatus.PENDING,
	})
	sslStatus: SslStatus;

	@Column({ type: 'varchar', length: 255, nullable: true, comment: 'Zone ID từ CF OAuth của tenant (dùng cho cloudflare_auto mode)' })
	cfTenantZoneId: string | null;

	@Column({ type: 'varchar', length: 512, nullable: true, comment: 'Ownership verification token từ Cloudflare SaaS' })
	verificationToken: string | null;

	@Column({ type: 'timestamp', nullable: true })
	verifiedAt: Date | null;

	@Column({ type: 'timestamp', nullable: true })
	sslActiveAt: Date | null;

	@Column({ type: 'timestamp', nullable: true })
	lastCheckedAt: Date | null;

	@Column({ type: 'jsonb', nullable: true, comment: 'Raw response từ Cloudflare API' })
	lastCheckResult: Record<string, any> | null;
}
