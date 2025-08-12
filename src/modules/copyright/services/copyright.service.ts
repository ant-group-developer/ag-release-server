import { Injectable, Logger } from '@nestjs/common';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { CreateTrackScanStatusDto } from '../dtos/copryright.dto';
import { TrackScanStatus } from '../entities/track-scan-status.entity';
import { ScanStatus } from '../enums/copyright.enum';
import { CopyrightAcrService } from './sub-services/copyright.acr.service';
import { CopyrightFilterService } from './sub-services/copyright.filter.service';
import { CopyrightResultService } from './sub-services/copyright.result.service';
import { CopyrightTrackService } from './sub-services/copyright.track.service';

@Injectable()
export class CopyrightService {
	private readonly logger = new Logger(CopyrightService.name);

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
		const filter = await this.copyrightFilterService.create(data);

		this.scanByFilter(filter).catch(() => {});

		return filter;
	}

	private async scanByFilter(filter: TrackScanStatus) {
		await this.copyrightFilterService.updateStatus(
			filter,
			ScanStatus.RUNNING,
		);

		const trackIds = await this.copyrightTrackService.getTrackIds(
			filter.filter,
		);

		await Promise.all(
			trackIds.map((id) =>
				this.scanTrackCopyright(id)
					.then(() => {
						this.logger.log(`Scanned track: ${id}`);
					})
					.catch((e) => this.logger.log(e)),
			),
		);

		await this.copyrightFilterService.updateStatus(
			filter,
			ScanStatus.FINISHED,
		);
	}

	// result
	async getResultOfTrack(id: string) {
		return this.copyrightResultService.getResultOfTrack(id);
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
