import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DistributionV2WorkerModule } from './modules/distribution-v2/distribution-v2.worker.module';

async function bootstrap() {
	const logger = new Logger('DistributionV2WorkerBootstrap');
	const app = await NestFactory.createApplicationContext(
		DistributionV2WorkerModule,
	);
	app.enableShutdownHooks();
	logger.log('Distribution-v2 worker application context started');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
