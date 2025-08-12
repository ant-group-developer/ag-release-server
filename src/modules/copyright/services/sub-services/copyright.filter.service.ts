import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTrackScanStatusDto } from '../../dtos/copryright.dto';
import { TrackScanStatus } from '../../entities/track-scan-status.entity';
import { ScanStatus } from '../../enums/copyright.enum';

export class CopyrightFilterService {
	constructor(
		@InjectRepository(TrackScanStatus)
		private readonly trackScanStatusRepo: Repository<TrackScanStatus>,
	) {}

	// filter
	async create(data: CreateTrackScanStatusDto): Promise<TrackScanStatus> {
		const newFilter = this.trackScanStatusRepo.create({
			...data,
			status: ScanStatus.PENDING,
		});

		const filterDb = await this.trackScanStatusRepo.save(newFilter);
		return filterDb;
	}

	async updateStatus(filter: TrackScanStatus, status: ScanStatus) {
		filter.status = status;
		await this.trackScanStatusRepo.save(filter);
	}
}
