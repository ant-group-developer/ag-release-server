// src/modules/ftp-provider-config/entities/ftp-provider-config.entity.ts
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'ftp_provider_configs' })
export class FtpProviderConfig extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 50, unique: true })
	code: string;

	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar' })
	host: string;

	@Column({ type: 'int', default: 21 })
	port: number;

	@Column({ type: 'varchar' })
	username: string;

	@Column({ type: 'text', name: 'password_encrypted' })
	passwordEncrypted: string;

	@Column({ type: 'varchar', length: 20, default: 'explicit' })
	secure: string;

	@Column({ type: 'varchar', name: 'base_path', default: '/root' })
	basePath: string;

	@Column({ type: 'boolean', name: 'is_active', default: false })
	isActive: boolean;

	@Column({ type: 'text', nullable: true })
	description: string | null;
}
