import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { VideoModule } from '../video/video.module';
import { VevoWebhookController } from './controllers/vevo-webhook.controller';
import { VevoCallbackApiKeyGuard } from './guards/vevo-callback-api-key.guard';
import { WebhookService } from './webhook.service';

@Module({
	imports: [ChannelModule, VideoModule],
	controllers: [VevoWebhookController],
	providers: [WebhookService, VevoCallbackApiKeyGuard],
})
export class WebhookModule {}
