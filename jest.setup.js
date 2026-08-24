// Jest setup: ensure required env vars are present before any test module
// (and its import chain) is loaded. Some services (e.g. util.encrypt.ts)
// throw at module-load time if CRYPTO_SECRET_KEY is missing, which breaks
// unrelated specs that only transitively import them.
process.env.CRYPTO_SECRET_KEY =
	process.env.CRYPTO_SECRET_KEY || 'test-crypto-secret-key-for-jest';
