import { Injectable } from '@nestjs/common';
import { VevoChannelCallbackDto } from '../channel/dto/vevo.dto';
import { ChannelService } from '../channel/services/channel.service';
import { VevoService } from '../channel/services/vevo.service';
import { LogModule } from '../log/entites/logs.entity';
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
			module: LogModule.VEVO_WEBHOOK,
			message: `[CHANNEL_RECEIVE] Vevo channel callback: ${payload.channel_name || 'Unknown'}`,
			data: { payload },
		});

		const result = await this.channelService.handleVevoCallback(payload);

		this.logsService.log({
			module: LogModule.VEVO_WEBHOOK,
			message: `[CHANNEL_HANDLED] Vevo channel callback: ${payload.channel_name || 'Unknown'}`,
			data: { payload, result },
		});

		return result;
	}

	async handleVevoVideoNotificationCallback(
		payload: VevoVideoNotificationDto,
	) {
		this.logsService.log({
			module: LogModule.VEVO_WEBHOOK,
			message: `[VIDEO_RECEIVE] Vevo video callback - ISRC: ${payload.isrc} | Stage: ${payload.stage}`,
			data: { payload },
		});

		if (payload.stage === VevoVideoNotificationStage.PRE) {
			const result = {
				processed: false,
				reason: 'Vevo pre-stage notification acknowledged',
				payload,
			};

			this.logsService.log({
				module: LogModule.VEVO_WEBHOOK,
				message: `[VIDEO_HANDLED] Vevo video callback (PRE-STAGE) - ISRC: ${payload.isrc}`,
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
			module: LogModule.VEVO_WEBHOOK,
			message: `[VIDEO_HANDLED] Vevo video callback - ISRC: ${payload.isrc} | Operation: ${payload.operation}`,
			data: { payload, result },
		});

		return result;
	}
}
