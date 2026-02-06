import CryptoJS from 'crypto-js';

const CRYPTO_SECRET_KEY = process.env.CRYPTO_SECRET_KEY || '';

if (!CRYPTO_SECRET_KEY) {
	throw new Error('Missing CRYPTO_SECRET_KEY in environment variables');
}

export function encryptSecret(plain: string): string {
	const encrypted = CryptoJS.AES.encrypt(plain, CRYPTO_SECRET_KEY);
	return encrypted.toString();
}

export function decryptSecret(payload: string): string {
	const decrypted = CryptoJS.AES.decrypt(payload, CRYPTO_SECRET_KEY);
	const result = decrypted.toString(CryptoJS.enc.Utf8);

	if (!result) {
		throw new Error('Decrypt failed - wrong key or corrupted data');
	}

	return result;
}

export function decryptSecretSafe(payload: string): string {
	try {
		return decryptSecret(payload);
	} catch (error) {
		console.error('Decrypt error:', error.message);
		return payload;
	}
}
