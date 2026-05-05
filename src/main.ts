import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsConfig } from './common/config/cors.config';
import { setupSwagger } from './common/config/swagger.config';
import { globalValidationPipe } from './common/config/validation.config';

export let APP_GOLBAL: INestApplication<any>;

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	APP_GOLBAL = app;

	setInterval(() => {
		const memoryData = process.memoryUsage();
		const toMB = (bytes: number) =>
			(bytes / 1024 / 1024).toFixed(2) + ' MB';
		Logger.log(
			`RAM Usage - RSS: ${toMB(memoryData.rss)} | Heap Total: ${toMB(memoryData.heapTotal)} | Heap Used: ${toMB(memoryData.heapUsed)}`,
			'MemoryTracker',
		);
	}, 5000);

	// Set up global validation pipe with class-transformer options
	app.useGlobalPipes(globalValidationPipe);

	// Set up Swagger documentation
	setupSwagger(app);

	app.enableCors(corsConfig());

	const port = process.env.APP_PORT || 3000;

	await app.listen(port);
	const logger = new Logger('Bootstrap');
	logger.log(`🚀 Server running on http://localhost:${port}`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
