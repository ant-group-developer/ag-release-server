import { Injectable, Logger } from '@nestjs/common';
import { ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import {
	CreateTrackScanStatusDto,
	QueryGetListResultScan,
	QueryGetListTask,
} from '../dtos/copyright.dto';
import { TrackScanStatus } from '../entities/track-scan-status.entity';
import { ScanStatus } from '../enums/copyright.enum';
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

		private readonly copyrightTrackService: CopyrightTrackService,
		private readonly copyrightTaskService: CopyrightTaskService,
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
			status: ScanStatus.RUNNING,
			trackNeedScanIds,
		});

		this.startScan(taskDb).catch((e) => {
			this.logger.error(
				`Failed to start scan for task ${taskDb.id}: ${e.message}`,
			);
		});

		return taskDb;
	}

	private async startScan(task: TrackScanStatus) {
		//
		const controller = new AbortController();
		this.scanControllers.set(task.id, controller);
		const signal = controller.signal;

		//
		await this.copyrightTaskService.updateStatus(
			task.id,
			ScanStatus.RUNNING,
		);

		if (signal.aborted) {
			this.logger.warn(`Scan cancelled for task ${task.id}`);

			await this.copyrightTaskService.updateStatus(
				task.id,
				ScanStatus.CANCEL,
			);
			return;
		}

		for (const id of task.trackNeedScanIds) {
			if (signal.aborted) {
				this.logger.warn(`Scan cancelled for task ${task.id}`);

				await this.copyrightTaskService.updateStatus(
					task.id,
					ScanStatus.CANCEL,
				);

				return;
			}

			try {
				await this.scanTrackCopyright(id);
				await this.copyrightTaskService.addScannedTrackId(task.id, id);

				this.logger.log(`Track scanned successfully: ${id}`);
			} catch (e) {
				await this.copyrightTaskService.updateStatus(
					task.id,
					ScanStatus.FAILED,
				);

				this.scanControllers.delete(task.id);

				this.logger.error(`Failed to scan track ${id}:`, e.message);
				return;
			}
		}

		this.scanControllers.delete(task.id);
		await this.copyrightTaskService.updateStatus(
			task.id,
			ScanStatus.FINISHED,
		);

		this.logger.log('List tracks scanned successfully');
	}

	async cancelScan(taskId: string) {
		const task = await this.copyrightTaskService.findOne(taskId);

		if (
			task.status === ScanStatus.RUNNING ||
			task.status === ScanStatus.PENDING
		) {
			const controller = this.scanControllers.get(taskId);
			if (controller) {
				controller.abort();
				this.scanControllers.delete(taskId);
				return true;
			}

			await this.copyrightTaskService.updateStatus(
				taskId,
				ScanStatus.CANCEL,
			);

			return;
		}

		throw new ResponseError({
			message: 'Scan is not active and cannot be cancelled.',
		});
	}

	async reScan(taskId: string) {
		const task = await this.copyrightTaskService.findOne(taskId);
		this.startScan(task).catch(() => {});
	}

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

	// acr
	async scanTrackCopyright(id: string) {
		const track = await this.copyrightTrackService.getTrack(id);

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
