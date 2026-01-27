// src/modules/distribution/delivery-config/entities/delivery-config.entity.ts
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'delivery_configs' })
export class DeliveryConfig extends BaseUUIDEntity {
	@Index({ unique: true })
	@Column({ type: 'varchar', length: 255 })
	name: string;

	@Column({ name: 'host', type: 'varchar' })
	host: string;

	@Column({ name: 'port', type: 'varchar' })
	port: number;

	@Column({ name: 'username', type: 'varchar' })
	username: string;

	@Column({ name: 'password', type: 'varchar' })
	password: string;

	// @Column({
	// 	name: 'provider_code',
	// 	type: 'varchar',
	// 	length: 50,
	// 	nullable: true,
	// })
	// providerCode: string | null;

	// @Column({ name: 'sftp_host', type: 'varchar', length: 255 })
	// sftpHost: string;

	// @Column({ name: 'sftp_username', type: 'varchar', length: 255 })
	// sftpUsername: string;

	// @Column({ name: 'sftp_password_encrypted', type: 'text', nullable: true })
	// sftpPasswordEncrypted: string | null;

	// @Column({ name: 'remote_path', type: 'varchar', length: 255, default: '/' })
	// remotePath: string;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;
}
