import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createDynamicCorsConfig } from './common/config/cors.config';
import { setupSwagger } from './common/config/swagger.config';
import { globalValidationPipe } from './common/config/validation.config';
import { TenantDomainService } from './modules/tenant-domain/tenant-domain.service';

export let APP_GOLBAL: INestApplication<any>;

async function bootstrap() {
	const role = process.env.APP_ROLE || 'api';
	const logger = new Logger('Bootstrap');

	if (role === 'worker') {
		const app = await NestFactory.createApplicationContext(AppModule);
		app.enableShutdownHooks();
		logger.log('⚙️  Worker instance started (no HTTP port)');
		return;
	}

	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	APP_GOLBAL = app;

	app.set('query parser', 'extended');

	app.useGlobalPipes(globalValidationPipe);

	setupSwagger(app);

	// Dynamic CORS: primary domains from env + active custom domains from DB (cached)
	const tenantDomainService = app.get(TenantDomainService);
	app.enableCors(
		createDynamicCorsConfig((domain) =>
			tenantDomainService.findActiveByDomain(domain),
		),
	);

	const port = process.env.APP_PORT || 3000;

	await app.listen(port);
	logger.log(`🚀 Server running on http://localhost:${port}`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
