import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { VevoController } from './controllers/vevo.controller';
import { VevoCallbackApiKeyGuard } from './guards/vevo-callback-api-key.guard';
import { WebhookService } from './webhook.service';

@Module({
	imports: [ChannelModule],
	controllers: [VevoController],
	providers: [WebhookService, VevoCallbackApiKeyGuard],
})
export class WebhookModule {}
