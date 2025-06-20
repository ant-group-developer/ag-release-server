import Joi from 'joi';

export const envValidationSchema = Joi.object({
	APP_PORT: Joi.number().default(3000),

	DB_HOST: Joi.string().required(),
	DB_PORT: Joi.number().default(5432),
	DB_USERNAME: Joi.string().required(),
	DB_PASSWORD: Joi.string().required(),
	DB_DATABASE: Joi.string().required(),

	SWAGGER_USER: Joi.string().default('1'),
	SWAGGER_PASSWORD: Joi.string().default('1'),
});
