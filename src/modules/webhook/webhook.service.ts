import { Injectable } from '@nestjs/common';
import { VevoChannelCallbackDto } from '../channel/dto/vevo.dto';
import { ChannelService } from '../channel/services/channel.service';
import { VevoService } from '../channel/services/vevo.service';
import { VideoService } from '../video/video.service';
import {
	VevoVideoNotificationDto,
	VevoVideoNotificationStage,
} from './dto/vevo-video-notification.dto';

@Injectable()
export class WebhookService {
	constructor(
		private readonly channelService: ChannelService,
		private readonly vevoService: VevoService,
		private readonly videoService: VideoService,
	) {}

	createVevoChannel(channelName: string) {
		return this.vevoService.newChannel(channelName);
	}

	handleVevoCallback(payload: VevoChannelCallbackDto) {
		return this.channelService.handleVevoCallback(payload);
	}

	async handleVevoVideoNotification(payload: VevoVideoNotificationDto) {
		if (payload.stage === VevoVideoNotificationStage.PRE) {
			return {
				processed: false,
				reason: 'Vevo pre-stage notification acknowledged',
				payload,
			};
		}

		return this.videoService.updateVevoExternalIdByIsrc({
			isrc: payload.isrc,
			operation: payload.operation,
			externalId: payload.external_id ?? null,
		});
	}
}
