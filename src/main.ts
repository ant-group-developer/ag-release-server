import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsConfig } from './common/config/cors.config';
import { setupSwagger } from './common/config/swagger.config';
import { globalValidationPipe } from './common/config/validation.config';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	// Set up global validation pipe with class-transformer options
	app.useGlobalPipes(globalValidationPipe);

	// Set up Swagger documentation
	setupSwagger(app);

	app.enableCors(corsConfig());

	const port = process.env.APP_PORT || 3000;

	await app.listen(port);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
