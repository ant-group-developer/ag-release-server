import { Injectable, Logger } from '@nestjs/common';
import { ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import {
	CreateTrackScanStatusDto,
	QueryGetListFilter,
	QueryGetListResultScan,
} from '../dtos/copyright.dto';
import { TrackScanStatus } from '../entities/track-scan-status.entity';
import { ScanStatus } from '../enums/copyright.enum';
import { CopyrightAcrService } from './sub-services/copyright.acr.service';
import { CopyrightFilterService } from './sub-services/copyright.filter.service';
import { CopyrightResultService } from './sub-services/copyright.result.service';
import { CopyrightTrackService } from './sub-services/copyright.track.service';

@Injectable()
export class CopyrightService {
	private readonly logger = new Logger(CopyrightService.name);
	private scanControllers = new Map<string, AbortController>();

	constructor(
		private readonly bucketService: BucketService,
		private readonly copyrightAcrService: CopyrightAcrService,

		private readonly copyrightTrackService: CopyrightTrackService,
		private readonly copyrightFilterService: CopyrightFilterService,
		private readonly copyrightResultService: CopyrightResultService,
	) {}

	// filter
	async handleCreateFilter(
		data: CreateTrackScanStatusDto,
	): Promise<TrackScanStatus> {
		const trackIdsToScan = await this.copyrightTrackService.getTrackIds(
			data.filter,
		);

		const filter = await this.copyrightFilterService.create(
			data,
			ScanStatus.RUNNING,
			trackIdsToScan,
		);

		this.startScan(filter).catch(() => {});

		return filter;
	}

	private async startScan(filter: TrackScanStatus) {
		//
		const controller = new AbortController();
		this.scanControllers.set(filter.id, controller);
		const signal = controller.signal;

		//
		await this.copyrightFilterService.updateStatus(
			filter.id,
			ScanStatus.RUNNING,
		);

		if (signal.aborted) {
			await this.copyrightFilterService.updateStatus(
				filter.id,
				ScanStatus.CANCEL,
			);
			return;
		}

		let trackScannedCount = 0;
		for (const id of filter.trackIdsToScan) {
			if (signal.aborted) {
				this.logger.warn(`Scan cancelled for filter ${filter.id}`);

				await this.copyrightFilterService.updateStatus(
					filter.id,
					ScanStatus.CANCEL,
				);

				return;
			} else {
				try {
					await this.scanTrackCopyright(id);
					trackScannedCount += 1;
					await this.copyrightFilterService.updateTrackScannedCount(
						filter.id,
						trackScannedCount,
					);

					this.logger.log(`Track scanned successfully: ${id}`);
				} catch (e) {
					this.logger.error(e);

					await this.copyrightFilterService.updateStatus(
						filter.id,
						ScanStatus.FAILED,
					);

					return;
				}
			}
		}

		this.scanControllers.delete(filter.id);
		await this.copyrightFilterService.updateStatus(
			filter.id,
			ScanStatus.FINISHED,
		);
	}

	async cancelScan(filterId: string) {
		const filter = await this.getDetailFilter(filterId);

		if (
			filter.status === ScanStatus.RUNNING ||
			filter.status === ScanStatus.PENDING
		) {
			const controller = this.scanControllers.get(filterId);
			if (controller) {
				controller.abort();
				this.scanControllers.delete(filterId);
				return true;
			}

			await this.copyrightFilterService.updateStatus(
				filterId,
				ScanStatus.CANCEL,
			);

			return;
		}

		throw new ResponseError({
			message: 'Scan is not active and cannot be cancelled.',
		});
	}

	async reScan(filterId: string) {
		const filter = await this.getDetailFilter(filterId);
		this.startScan(filter).catch(() => {});
	}

	async getDetailFilter(filterId: string) {
		return await this.copyrightFilterService.getDetailFilter(filterId);
	}

	async getListFilter(query: QueryGetListFilter) {
		return await this.copyrightFilterService.getListFilter(query);
	}

	// result
	async getResultOfTrack(id: string) {
		return this.copyrightResultService.getResultOfTrack(id);
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
