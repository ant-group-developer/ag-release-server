import { Injectable } from '@nestjs/common';
import { VevoChannelCallbackDto } from '../channel/dto/vevo.dto';
import { ChannelService } from '../channel/services/channel.service';
import { VevoService } from '../channel/services/vevo.service';

@Injectable()
export class WebhookService {
	constructor(
		private readonly channelService: ChannelService,
		private readonly vevoService: VevoService,
	) {}

	createVevoChannel(channelName: string) {
		return this.vevoService.newChannel(channelName);
	}

	handleVevoCallback(payload: VevoChannelCallbackDto) {
		return this.channelService.handleVevoCallback(payload);
	}
}
