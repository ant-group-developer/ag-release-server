import Joi from 'joi';

export const envValidationSchema = Joi.object({
	APP_PORT: Joi.number().default(3000),

	//DB
	DB_HOST: Joi.string().required(),
	DB_PORT: Joi.number().default(5432),
	DB_USERNAME: Joi.string().required(),
	DB_PASSWORD: Joi.string().required(),
	DB_DATABASE: Joi.string().required(),

	DB_SYNCHRONIZE: Joi.boolean().required().default(false),
	DB_LOGGING: Joi.boolean().required().default(false),
	DB_RETRY_CONNECT: Joi.number().required().default(3),

	//Swagger
	SWAGGER_USER: Joi.string().default('1'),
	SWAGGER_PASSWORD: Joi.string().default('1'),

	// Default user
	DEFAULT_USER_ID: Joi.string().required(),
	DEFAULT_USER_TYPE: Joi.string().required(),
	DEFAULT_EMAIL: Joi.string().required(),

	// Email
	EMAIL_USER: Joi.string().required(),
	EMAIL_PASS: Joi.string().required(),
	EMAIL_SERVICE: Joi.string().required(),

	// JWT
	JWT_PRIVATE_KEY_PATH: Joi.string().required(),
	JWT_PUBLIC_KEY_PATH: Joi.string().required(),
	JWT_ISSUER: Joi.string().required(),
	JWT_AUDIENCE: Joi.string().required(),
	JWT_EXPIRES_IN: Joi.string().default('15m'),
	JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
	JWT_KID: Joi.string().default('v1'),

	// BACK UP
	BACKUP_RCLONE_CONFIG_PATH: Joi.string().required(),
	BACKUP_BASE_URL_GCS: Joi.string().required(),
	BACKUP_BASE_URL_CONSOLE_GCS: Joi.string().required(),

	// GCS
	GCS_PUBLIC_BUCKET: Joi.string().required(),
	GCS_PATH_KEY: Joi.string().required(),
	GCS_PROTECTED_BUCKET: Joi.string().required(),

	// CRYPTO_SECRET_KEY
	CRYPTO_SECRET_KEY: Joi.string().required(),

	// ===== GRPC =====
	GRPC_UPC_URL: Joi.string().required(),
	GRPC_ISRC_URL: Joi.string().required(),

	// R2 Storage
	R2_ENDPOINT: Joi.string().optional(),
	R2_ACCESS_KEY_ID: Joi.string().optional(),
	R2_SECRET_ACCESS_KEY: Joi.string().optional(),
	R2_PUBLIC_BUCKET: Joi.string().optional(),
	R2_PROTECTED_BUCKET: Joi.string().optional(),
	R2_PUBLIC_BASE_URL: Joi.string().optional(),
	R2_PRIVATE_BASE_URL: Joi.string().optional(),

	// Internal API Key
	INTERNAL_API_KEY: Joi.string().optional(),

	// Vevo callback API key
	VEVO_CALLBACK_API_KEY: Joi.string().required(),

	// ClickHouse
	CLICKHOUSE_URL: Joi.string().required().default('http://127.0.0.1:8123'),
	CLICKHOUSE_DATABASE: Joi.string().required().default('music_analytics'),
	CLICKHOUSE_USER: Joi.string().required().default('default'),
	CLICKHOUSE_PASSWORD: Joi.string().allow('').default(''),

	// YouTube key encryption (AES-256-GCM master key).
	// Value: base64 32 bytes → 44 chars có padding. Generate: `openssl rand -base64 32`.
	// Consumed bởi YoutubeEncryptionService.onModuleInit (bắt buộc, không có default).
	YOUTUBE_KEY_ENCRYPTION_SECRET: Joi.string().base64().length(44).required(),

	// FTP / ETL
	FTP_HOST: Joi.string().allow('').optional(),
	FTP_PORT: Joi.number().default(21),
	FTP_USER: Joi.string().allow('').optional(),
	FTP_PASSWORD: Joi.string().allow('').optional(),
	FTP_SECURE: Joi.string()
		.allow('true', 'false', 'explicit', 'implicit')
		.default('explicit'),
	FTP_BASE_PATH: Joi.string().default('/root'),
	FTP_SYNC_MODE: Joi.string().valid('manual', 'auto').default('manual'),
	FTP_SYNC_CRON: Joi.string().default('0 2 * * *'),
	FTP_DISCOVERY_CRON: Joi.string().default('0 1 * * *'),

	// Redis (bắt buộc — cache2.module inject trực tiếp process.env, không có fallback)
	REDIS_HOST: Joi.string().required(),
	REDIS_PORT: Joi.number().default(6379),
	REDIS_PASSWORD: Joi.string().allow('').default(''),

	// Cloudflare SaaS + OAuth (custom domain feature).
	CF_API_TOKEN: Joi.string().allow('').optional(),
	CF_ZONE_ID: Joi.string().allow('').optional(),
	CF_FALLBACK_ORIGIN: Joi.string().default('cname.antmusic.net'),
	CF_OAUTH_CLIENT_ID: Joi.string().allow('').optional(),
	CF_OAUTH_CLIENT_SECRET: Joi.string().allow('').optional(),
	CF_OAUTH_REDIRECT_URI: Joi.string().uri().allow('').optional(),

	// Domains — CSV list, separator `,`. Empty là hợp lệ (fallback trong domain.config).
	CORS_ORIGINS: Joi.string().allow('').default(''),
	PRIMARY_DOMAINS: Joi.string().allow('').default(''),
});
