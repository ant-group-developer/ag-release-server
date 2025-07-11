import Joi from 'joi';
import { ENV } from '../enums/common';

export const envValidationSchema = Joi.object({
	APP_PORT: Joi.number().default(3000),
	ENV: Joi.string().default(ENV.LOCAL),

	//DB
	DB_HOST: Joi.string().required(),
	DB_PORT: Joi.number().default(5432),
	DB_USERNAME: Joi.string().required(),
	DB_PASSWORD: Joi.string().required(),
	DB_DATABASE: Joi.string().required(),

	//Swagger
	SWAGGER_USER: Joi.string().default('1'),
	SWAGGER_PASSWORD: Joi.string().default('1'),

	// Default user
	DEFAULT_USER_ID: Joi.string().required(),
	USER_TYPE: Joi.string().required(),
	DEFAULT_EMAIL: Joi.string().required(),

	// Email
	EMAIL_USER: Joi.string().required(),
	EMAIL_PASS: Joi.string().required(),
	EMAIL_SERVICE: Joi.string().required(),

	// Telegram
	TELEGRAM_TOKEN_LOCAL: Joi.string().required(),
	TELEGRAM_TOKEN_DEV_TEST: Joi.string().required(),
	TELEGRAM_TOKEN_PRODUCTION: Joi.string().required(),

	// Path
	PATH_GCS_KEY: Joi.string().required(),
	// PATH_TEMPLATES: Joi.string().required(),
});
