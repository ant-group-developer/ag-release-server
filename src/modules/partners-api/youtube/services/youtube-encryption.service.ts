import {
	Injectable,
	InternalServerErrorException,
	Logger,
	OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { YOUTUBE_KEY_ENCRYPTION_SECRET_ENV } from '../constants/youtube.constants';

/**
 * AES-256-GCM encrypt/decrypt cho YouTube API keys.
 *
 * Format ciphertext luu DB: `<iv_b64>:<authTag_b64>:<ciphertext_b64>`
 *
 * Master key: lay tu env `YOUTUBE_KEY_ENCRYPTION_SECRET` (32 bytes base64).
 * Generate: `openssl rand -base64 32`
 *
 * Neu master key thay doi -> tat ca ciphertext cu khong decrypt duoc,
 * admin phai re-add lai keys.
 */
@Injectable()
export class YoutubeEncryptionService implements OnModuleInit {
	private readonly logger = new Logger(YoutubeEncryptionService.name);
	private masterKey!: Buffer;

	private static readonly ALGORITHM = 'aes-256-gcm';
	private static readonly KEY_LENGTH = 32; // 256 bits
	private static readonly IV_LENGTH = 12; // GCM standard
	private static readonly AUTH_TAG_LENGTH = 16;

	onModuleInit(): void {
		const raw = process.env[YOUTUBE_KEY_ENCRYPTION_SECRET_ENV];
		if (!raw) {
			throw new InternalServerErrorException(
				`Missing env ${YOUTUBE_KEY_ENCRYPTION_SECRET_ENV}. Generate: openssl rand -base64 32`,
			);
		}
		const key = Buffer.from(raw, 'base64');
		if (key.length !== YoutubeEncryptionService.KEY_LENGTH) {
			throw new InternalServerErrorException(
				`${YOUTUBE_KEY_ENCRYPTION_SECRET_ENV} must decode to ${YoutubeEncryptionService.KEY_LENGTH} bytes (got ${key.length}). ` +
					`Generate: openssl rand -base64 32`,
			);
		}
		this.masterKey = key;
		this.logger.log('YouTube encryption master key loaded');
	}

	/**
	 * Encrypt plaintext API key.
	 * @returns ciphertext string ready to persist
	 */
	encrypt(plaintext: string): string {
		const iv = crypto.randomBytes(YoutubeEncryptionService.IV_LENGTH);
		const cipher = crypto.createCipheriv(
			YoutubeEncryptionService.ALGORITHM,
			this.masterKey,
			iv,
		);
		const encrypted = Buffer.concat([
			cipher.update(plaintext, 'utf8'),
			cipher.final(),
		]);
		const authTag = cipher.getAuthTag();
		return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
	}

	/**
	 * Decrypt ciphertext luu tu encrypt().
	 * Throw neu ciphertext bi corrupt hoac master key sai.
	 */
	decrypt(ciphertext: string): string {
		const parts = ciphertext.split(':');
		if (parts.length !== 3) {
			throw new InternalServerErrorException(
				'Invalid youtube api key ciphertext format',
			);
		}
		const [ivB64, authTagB64, dataB64] = parts;
		const iv = Buffer.from(ivB64, 'base64');
		const authTag = Buffer.from(authTagB64, 'base64');
		const data = Buffer.from(dataB64, 'base64');

		const decipher = crypto.createDecipheriv(
			YoutubeEncryptionService.ALGORITHM,
			this.masterKey,
			iv,
		);
		decipher.setAuthTag(authTag);

		try {
			const decrypted = Buffer.concat([
				decipher.update(data),
				decipher.final(),
			]);
			return decrypted.toString('utf8');
		} catch (err: any) {
			this.logger.error(
				`Decrypt YouTube API key failed: ${err.message}. Master key may have changed.`,
			);
			throw new InternalServerErrorException(
				'Cannot decrypt YouTube API key. Master key mismatch or ciphertext corrupt.',
			);
		}
	}

	/**
	 * Lay hint 4 ky tu cuoi de hien thi UI (AIza…tryHY).
	 */
	buildHint(plaintext: string): string {
		const tail = plaintext.slice(-4);
		return `AIza…${tail}`;
	}
}
