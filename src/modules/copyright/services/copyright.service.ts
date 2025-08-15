import { Injectable, Logger } from '@nestjs/common';
import { ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import {
	CreateTrackScanStatusDto,
	QueryGetListResultScan,
	QueryGetListTask,
} from '../dtos/copyright.dto';
import { TrackScanStatus } from '../entities/track-scan-status.entity';
import { ErrorTask, ScanStatus } from '../enums/copyright.enum';
import { CopyrightAcrService } from './sub-services/copyright.acr.service';
import { CopyrightResultService } from './sub-services/copyright.result.service';
import { CopyrightTaskService } from './sub-services/copyright.task.service';
import { CopyrightTrackService } from './sub-services/copyright.track.service';

@Injectable()
export class CopyrightService {
	private readonly logger = new Logger(CopyrightService.name);
	private scanControllers = new Map<string, AbortController>();

	constructor(
		private readonly bucketService: BucketService,
		private readonly copyrightAcrService: CopyrightAcrService,
		private readonly copyrightTaskService: CopyrightTaskService,
		private readonly copyrightTrackService: CopyrightTrackService,
		private readonly copyrightResultService: CopyrightResultService,
	) {}

	// task
	async handleCreateTask(
		data: CreateTrackScanStatusDto,
	): Promise<TrackScanStatus> {
		const { filter } = data;

		const trackNeedScanIds =
			await this.copyrightTrackService.getTrackIds(filter);

		const taskDb = await this.copyrightTaskService.create({
			filter,
			status: ScanStatus.PENDING,
			trackNeedScanIds,
		});

		this.startTask(taskDb).catch((e) => {
			this.logger.error(
				`Failed to start scan for task ${taskDb.id}: ${e.message}`,
			);
		});

		return taskDb;
	}

	private async startTask(task: TrackScanStatus) {
		const { id: taskId } = task;
		this.createSignal(taskId);

		await this.updateTaskStatus(taskId, ScanStatus.RUNNING);

		// processListTracks
		try {
			await this.processTask(task);
			await this.finishTask(task);
		} catch (e) {
			if (e.message === ErrorTask.CANCEL_TASK) {
				await this.cancelTask(taskId);
			} else {
				await this.failTask(taskId);
			}
		} finally {
			this.deleteSignal(taskId);

			this.logger.log(this.scanControllers);
		}
	}

	async processTask(task: TrackScanStatus) {
		for (const trackId of task.trackNeedScanIds) {
			this.checkAbort(task.id);
			await this.processSubTask({ taskId: task.id, trackId });
		}
	}

	async processSubTask({
		taskId,
		trackId,
	}: {
		trackId: string;
		taskId: string;
	}) {
		try {
			await this.scanTrackCopyright(trackId);
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
	async scanTrackCopyright(id: string) {
		const track = await this.copyrightTrackService.getTrack(id);

		if (!track.audioFile) {
			this.logger.warn(`Missing audio file of track ${id}`);
			return;
		}

		const { fileBuffer } = await this.bucketService.getFileBuffer(
			track.audioFile.fileId,
		);

		const resultScan = await this.copyrightAcrService.scanBufferCopyright({
			buffer: fileBuffer,
			duration: track.audioFile.duration,
		});

		const trackScanHistory = this.copyrightResultService.create({
			result: resultScan,
			trackId: id,
		});

		await this.copyrightTrackService.updateIsScannedTrack(id);

		return trackScanHistory;
	}
}
