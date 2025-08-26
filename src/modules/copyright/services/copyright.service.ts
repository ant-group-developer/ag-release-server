import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResponseError } from 'src/common/dtos/response.dto';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { AppConfigKey } from 'src/modules/app-config/enums/app-config.enum';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { ScanCopyrightStatus } from 'src/modules/track/enum/track.enum';
import {
	CompareHistoryScanDto,
	CreateTrackScanStatusDto,
	QueryGetListResultScan,
	QueryGetListTask,
} from '../dtos/copyright.dto';
import { TrackScanStatus } from '../entities/track-scan-status.entity';
import { ErrorTask, ScanStatus } from '../enums/copyright.enum';
import { ResultScan } from '../interface/copyright.interface';
import { CopyrightAcrService } from './sub-services/copyright.acr.service';
import { CopyrightResultService } from './sub-services/copyright.result.service';
import { CopyrightTaskService } from './sub-services/copyright.task.service';
import { CopyrightTrackService } from './sub-services/copyright.track.service';

@Injectable()
export class CopyrightService implements OnModuleInit {
	private readonly logger = new Logger(CopyrightService.name);
	private scanControllers = new Map<string, AbortController>();

	private scoreWarning: number;
	private chunkDuration: number;

	constructor(
		private readonly bucketService: BucketService,
		private readonly appConfigService: AppConfigService,

		private readonly copyrightAcrService: CopyrightAcrService,
		private readonly copyrightTaskService: CopyrightTaskService,
		private readonly copyrightTrackService: CopyrightTrackService,
		private readonly copyrightResultService: CopyrightResultService,
	) {}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.scoreWarning = this.appConfigService.getValue(
			AppConfigKey.SCORE_WARNING,
		);

		this.chunkDuration = this.appConfigService.getValue(
			AppConfigKey.CHUNK_DURATION,
		);
	}

	// task
	async handleCreateTask(
		data: CreateTrackScanStatusDto,
	): Promise<TrackScanStatus> {
		const { filter, chunkDuration } = data;

		const trackNeedScanIds =
			await this.copyrightTrackService.getTrackIds(filter);

		const taskDb = await this.copyrightTaskService.create({
			filter,
			status: ScanStatus.PENDING,
			trackNeedScanIds,
			chunkDuration: chunkDuration ?? this.chunkDuration,
		});

		this.processTask(taskDb).catch((e) => {
			this.logger.error(
				`Failed to start scan for task ${taskDb.id}: ${e.message}`,
			);
		});

		return taskDb;
	}

	private async processTask(task: TrackScanStatus) {
		const { id: taskId } = task;

		// processListTracks
		try {
			await this.startTask(task);
			await this.finishTask(task);
		} catch (e) {
			if (e.message === ErrorTask.CANCEL_TASK) {
				await this.cancelTask(taskId);
			} else {
				await this.failTask(taskId);
			}
		} finally {
			this.deleteSignal(taskId);
		}
	}

	// task handlers
	private async startTask(task: TrackScanStatus) {
		const { id: taskId } = task;
		this.createSignal(taskId);
		await this.updateTaskStatus(taskId, ScanStatus.RUNNING);

		for (const trackId of task.trackNeedScanIds) {
			this.checkAbort(taskId);
			await this.processSubTask({ taskId, trackId });
		}
	}

	private async cancelTask(taskId: string) {
		await this.updateTaskStatus(taskId, ScanStatus.CANCEL);
		this.logger.error(`Task ${taskId} cancel`);
	}

	private async failTask(taskId: string) {
		await this.updateTaskStatus(taskId, ScanStatus.FAILED);
		this.logger.error(`Task ${taskId} failed`);
	}

	private async finishTask(task: TrackScanStatus) {
		await this.updateTaskStatus(task.id, ScanStatus.FINISHED);
		this.logger.log(`Task ${task.id} finished successfully`);
	}

	// sub task
	private async processSubTask({
		taskId,
		trackId,
	}: {
		trackId: string;
		taskId: string;
	}) {
		try {
			const task = await this.copyrightTaskService.findOne(taskId);
			await this.scanTrackCopyright({
				trackId,
				chunkDuration: task.chunkDuration,
			});

			await this.copyrightTaskService.addScannedTrackId({
				taskId,
				trackId,
			});
			this.logger.log(`Track scanned successfully: ${trackId}`);
		} catch {
			throw new ResponseError({
				message: ErrorTask.FAIL_PROCESSING_SINGLE_TRACK,
			});
		}
	}

	private checkAbort(taskId: string) {
		const signal = this.getSignal(taskId);

		if (!signal || signal.aborted) {
			this.logger.warn(`Scan cancelled for task ${taskId}`);
			throw new ResponseError({ message: ErrorTask.CANCEL_TASK });
		}
	}

	private async updateTaskStatus(taskId: string, status: ScanStatus) {
		await this.copyrightTaskService.updateStatus(taskId, status);
	}

	async cancelScan(taskId: string) {
		const task = await this.copyrightTaskService.findOne(taskId);

		if (task.status === ScanStatus.RUNNING) {
			const controller = this.scanControllers.get(taskId);
			if (controller) {
				controller.abort();
			}
		}

		throw new ResponseError({
			message: 'Scan is not active and cannot be cancelled.',
		});
	}

	async reScan(taskId: string) {
		const task = await this.copyrightTaskService.findOne(taskId);

		const newTask = await this.handleCreateTask({
			filter: {
				...task.filter,
				ignoreTrackScanned: false,
			},
		});

		return newTask;
	}

	// signal
	private createSignal(id: string) {
		const controller = new AbortController();
		this.scanControllers.set(id, controller);
		return controller.signal;
	}

	private getSignal(id: string) {
		const controller = this.scanControllers.get(id);
		return controller?.signal;
	}

	private deleteSignal(id: string) {
		this.scanControllers.delete(id);
	}

	//
	async getDetailTask(taskId: string) {
		return await this.copyrightTaskService.getDetailTask(taskId);
	}

	async getListTask(query: QueryGetListTask) {
		return await this.copyrightTaskService.getListTask(query);
	}

	// result
	async getOneResult(id: string) {
		return this.copyrightResultService.getOneResult(id);
	}

	async getResultOfTrack(trackId: string) {
		return this.copyrightResultService.getResultOfTrack(trackId);
	}

	async getListResult(data: QueryGetListResultScan) {
		return await this.copyrightResultService.getListResult(data);
	}

	async deleteResultOfTrack({ trackId }: { trackId: string }) {
		await this.copyrightResultService.deleteByTrackId(trackId);
	}

	async deleteResultOfTrackSafe({ trackId }: { trackId: string }) {
		await this.deleteResultOfTrack({ trackId }).catch((e) =>
			this.logger.warn(`Skip delete, reason: ${e.message}`),
		);
	}

	// acr
	async scanTrackCopyright({
		trackId,
		chunkDuration,
	}: {
		trackId: string;
		chunkDuration?: number;
	}) {
		const track = await this.copyrightTrackService.getTrack(trackId);

		if (!track.audioFile) {
			this.logger.warn(`Missing audio file of track ${trackId}`);

			await this.copyrightTrackService.updateStatusScannedTrack(
				trackId,
				ScanCopyrightStatus.REJECTED,
			);
			return;
		}

		const { fileBuffer } = await this.bucketService.getFileBuffer(
			track.audioFile.fileId,
		);

		const resultScanAcr =
			await this.copyrightAcrService.scanBufferCopyright({
				buffer: fileBuffer,
				duration: track.audioFile.duration,
				chunkDuration: chunkDuration ?? this.chunkDuration,
			});

		const scanCopyrightStatus = this.getScanCopyrightStatus(resultScanAcr);

		const trackScanHistory = this.copyrightResultService.create({
			result: resultScanAcr,
			trackId,
		});

		await this.copyrightTrackService.updateStatusScannedTrack(
			trackId,
			scanCopyrightStatus,
		);

		return trackScanHistory;
	}

	private getScanCopyrightStatus(
		resultScan: ResultScan[],
	): ScanCopyrightStatus {
		const musicItems: { start: number; end: number; score: number }[] = [];
		const hummingItems: {
			start: number;
			end: number;
			score: number;
		}[] = [];

		for (const scan of resultScan) {
			if (scan.content?.music) {
				for (const m of scan.content.music) {
					musicItems.push({
						start: scan.key.startSecond,
						end: scan.key.endSecond,
						score: m.score,
					});
				}
			}

			if (scan.content?.humming) {
				for (const h of scan.content.humming) {
					hummingItems.push({
						start: scan.key.startSecond,
						end: scan.key.endSecond,
						score: Math.round(h.score * 100),
					});
				}
			}
		}

		if (this.checkWarning(musicItems) || this.checkWarning(hummingItems)) {
			return ScanCopyrightStatus.WARNING;
		}

		return ScanCopyrightStatus.FINISHED;
	}

	private checkWarning(
		items: { start: number; end: number; score: number }[],
	) {
		items.sort((a, b) => a.start - b.start);

		for (let i = 0; i < items.length - 1; i++) {
			if (
				items[i].score > this.scoreWarning &&
				items[i + 1].score > this.scoreWarning
			) {
				return true;
			}
		}
		return false;
	}

	// compare
	async compareResultOfTrack(payload: CompareHistoryScanDto) {
		return await this.copyrightResultService.compareResultOfTrack(payload);
	}
}
