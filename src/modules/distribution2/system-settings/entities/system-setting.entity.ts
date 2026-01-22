// src/modules/distribution/system-settings/entities/system-setting.entity.ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'system_settings' })
export class SystemSetting {
	@PrimaryColumn({ type: 'varchar', length: 100 })
	key: string;

	@Column({ type: 'text', nullable: true })
	value: string | null;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
	updatedAt: Date;
}
