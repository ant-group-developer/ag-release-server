import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';
import { YoutubeApiKeyStatus } from '../enum/youtube.enum';

@Entity('youtube_api_keys', {
	comment:
		'Danh sach Google/YouTube Data API keys de rotate tranh quota limit',
})
@Index('IDX_youtube_api_keys_status_used', ['status', 'unitsConsumedToday'])
export class YoutubeApiKey extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 100,
		unique: true,
		comment: 'Friendly name cho admin UI',
	})
	alias: string;

	@Column({
		type: 'text',
		name: 'key_encrypted',
		comment:
			'API key duoc encrypt AES-256-GCM: iv:authTag:ciphertext (base64)',
	})
	keyEncrypted: string;

	@Column({
		type: 'varchar',
		length: 20,
		name: 'key_hint',
		comment: '4 ky tu cuoi plaintext key de hien thi UI (AIza...tryHY)',
	})
	keyHint: string;

	@Column({
		type: 'varchar',
		length: 20,
		default: YoutubeApiKeyStatus.ACTIVE,
		comment: 'active | disabled | quota_exceeded | invalid',
	})
	status: YoutubeApiKeyStatus;

	@Column({
		type: 'integer',
		name: 'daily_quota_limit',
		default: 10000,
		comment: 'Quota limit daily cua key (mac dinh 10000 units/ngay)',
	})
	dailyQuotaLimit: number;

	@Column({
		type: 'integer',
		name: 'units_consumed_today',
		default: 0,
		comment: 'So units da tieu thu trong ngay hien tai',
	})
	unitsConsumedToday: number;

	@Column({
		type: 'timestamptz',
		name: 'last_reset_at',
		default: () => 'now()',
		comment: 'Thoi diem reset counter gan nhat',
	})
	lastResetAt: Date;

	@Column({
		type: 'integer',
		name: 'consecutive_error_count',
		default: 0,
	})
	consecutiveErrorCount: number;

	@Column({
		type: 'timestamptz',
		name: 'last_used_at',
		nullable: true,
	})
	lastUsedAt: Date | null;

	@Column({
		type: 'text',
		name: 'last_error',
		nullable: true,
	})
	lastError: string | null;
}
