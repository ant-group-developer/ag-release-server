// util.encrypt.ts (fix chắc chắn nhất)
// lỗi này = process.env.SECRET_KEY_HEX đang bị sai độ dài (thường do quote / space / newline / BOM)

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function normalizeHexKey(raw?: string): string {
	if (!raw) return '';

	// 1) trim + remove quotes
	let s = raw.trim().replace(/^['"]|['"]$/g, '');

	// 2) remove ALL whitespace/newlines inside
	s = s.replace(/\s+/g, '');

	// 3) if someone pasted "0x...."
	if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);

	return s;
}

function getKey(): Buffer {
	const hex = normalizeHexKey(process.env.SECRET_KEY_HEX);

	if (!hex) throw new Error('Missing SECRET_KEY_HEX');
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
		throw new Error(
			`SECRET_KEY_HEX must be 64 hex chars. got length=${hex.length}`,
		);
	}

	return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
	const iv = crypto.randomBytes(IV_LEN);
	const cipher = crypto.createCipheriv(ALGO, getKey(), iv);

	const ciphertext = Buffer.concat([
		cipher.update(plain, 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString(
		'base64',
	)}`;
}

export function decryptSecret(payload: string): string {
	const [ivB64, tagB64, ctB64] = payload.split('.');
	if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid format');

	const iv = Buffer.from(ivB64, 'base64');
	const tag = Buffer.from(tagB64, 'base64');
	const ciphertext = Buffer.from(ctB64, 'base64');

	const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
	decipher.setAuthTag(tag);

	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString('utf8');
}

export function decryptSecretSafe(payload: string): string {
	try {
		return decryptSecret(payload);
	} catch (error) {
		return payload;
	}
}
