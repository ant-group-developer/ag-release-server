import { Injectable } from '@nestjs/common';
import { VevoChannelCallbackDto } from '../channel/dto/vevo.dto';
import { ChannelService } from '../channel/services/channel.service';
import { VevoService } from '../channel/services/vevo.service';
import { LogModule } from '../log/entites/logs.entity';
import { LogsService } from '../log/services/logs.services';
import { ReleaseExecutionStepStatus } from '../release/modules/release-executions3/enums/release-execution3.enum';
import { ReleaseExecution3Service } from '../release/modules/release-executions3/services/release-execution3.service';
import { VevoJobResultService } from '../release/modules/release-executions3/services/vevo-job-result.service';
import { VideoService } from '../video/video.service';
import { VevoQueueWebhookDto } from './dto/vevo-queue-webhook.dto';
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
		private readonly releaseExecution3Service: ReleaseExecution3Service,
		private readonly vevoJobResultService: VevoJobResultService,
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

	async handleVevoQueueCallback(payload: VevoQueueWebhookDto) {
		const jobId = payload.id;
		const result = await this.vevoJobResultService.processJobResult({
			job: payload,
			source: 'webhook',
		});

		if (
			result.terminal &&
			!result.duplicate &&
			result.releaseExecutionId &&
			result.status !== ReleaseExecutionStepStatus.WAITING_PARTNER
		) {
			await this.releaseExecution3Service.resumeExecution(
				result.releaseExecutionId,
			);
		}

		this.logsService.log({
			module: LogModule.VEVO_WEBHOOK,
			message: result.success
				? `[QUEUE_COMPLETED] VEVO job succeeded: ${jobId}`
				: result.matched
					? `[QUEUE_FAILED] VEVO job failed: ${jobId}`
					: `[QUEUE_UNMATCHED] VEVO queue job not found: ${jobId}`,
			releaseExecutionId: result.releaseExecutionId,
			releaseExecutionStepId: result.waitStepId,
			data: {
				jobId,
				state: payload.state,
				success: result.success,
				error: result.error,
				reason: result.reason,
				errors: payload.result?.errors ?? [],
				warnings: payload.result?.warnings ?? [],
			},
		});

		return {
			received: true,
			...result,
			processed: result.terminal && !result.duplicate,
		};
	}
}
