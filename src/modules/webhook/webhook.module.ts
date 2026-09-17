import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelModule } from '../channel/channel.module';
import { ReleaseExecutionStep3 } from '../release/modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseModule } from '../release/release.module';
import { VideoModule } from '../video/video.module';
import { VevoWebhookController } from './controllers/vevo-webhook.controller';
import { VevoCallbackApiKeyGuard } from './guards/vevo-callback-api-key.guard';
import { VevoQueueWebhookSecretGuard } from './guards/vevo-queue-webhook-secret.guard';
import { WebhookService } from './webhook.service';

@Module({
	imports: [
		ChannelModule,
		VideoModule,
		ReleaseModule,
		TypeOrmModule.forFeature([ReleaseExecutionStep3]),
	],
	controllers: [VevoWebhookController],
	providers: [
		WebhookService,
		VevoCallbackApiKeyGuard,
		VevoQueueWebhookSecretGuard,
	],
})
export class WebhookModule {}
