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
});
