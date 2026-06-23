import { Injectable } from '@nestjs/common';
import { VevoChannelCallbackDto } from '../channel/dto/vevo.dto';
import { ChannelService } from '../channel/services/channel.service';
import { VevoService } from '../channel/services/vevo.service';
import { LogsService } from '../log/services/logs.services';
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
		private readonly logsService: LogsService,
	) {}

	createVevoChannel(channelName: string) {
		return this.vevoService.newChannel(channelName);
	}

	async handleVevoChannelCallback(payload: VevoChannelCallbackDto) {
		this.logsService.log({
			module: 'webhook.vevo.channel',
			message: 'Received Vevo channel callback',
			data: { payload },
		});

		const result = await this.channelService.handleVevoCallback(payload);

		this.logsService.log({
			module: 'webhook.vevo.channel',
			message: 'Handled Vevo channel callback',
			data: { payload, result },
		});

		return result;
	}

	async handleVevoVideoNotificationCallback(
		payload: VevoVideoNotificationDto,
	) {
		this.logsService.log({
			module: 'webhook.vevo.video',
			message: 'Received Vevo video notification callback',
			data: { payload },
		});

		if (payload.stage === VevoVideoNotificationStage.PRE) {
			const result = {
				processed: false,
				reason: 'Vevo pre-stage notification acknowledged',
				payload,
			};

			this.logsService.log({
				module: 'webhook.vevo.video',
				message: 'Handled Vevo video notification callback',
				data: { payload, result },
			});

			return result;
		}

		const result = await this.videoService.updateVevoExternalIdByIsrc({
			isrc: payload.isrc,
			operation: payload.operation,
			externalId: payload.external_id ?? null,
		});

		this.logsService.log({
			module: 'webhook.vevo.video',
			message: 'Handled Vevo video notification callback',
			data: { payload, result },
		});

		return result;
	}
}
