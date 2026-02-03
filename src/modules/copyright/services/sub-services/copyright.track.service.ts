import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Track } from 'src/modules/track/entities/track.entity';
import { ScanCopyrightStatus } from 'src/modules/track/enum/track.enum';
import { Repository } from 'typeorm';
import { TrackScanFilter } from '../../interface/copyright.interface';

@Injectable()
export class CopyrightTrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	async updateStatusScannedTrack(
		id: string,
		scanCopyrightStatus: ScanCopyrightStatus,
	) {
		await this.trackRepo.update({ id }, { scanCopyrightStatus });
	}

	async getTrackIds(filter: TrackScanFilter) {
		const { ignoreTrackScanned } = filter;

		const query = this.createQueryGetTrackIds(filter);

		const tracks = await query.getMany();

		return tracks
			.filter((tracks) => {
				if (ignoreTrackScanned) {
					return (
						tracks.scanCopyrightStatus ===
						ScanCopyrightStatus.UN_SCANNED
					);
				}

				return true;
			})
			.map((track) => track.id);
	}

	async getTrack(id: string) {
		const track = await this.trackRepo.findOne({
			where: { id },
			relations: { audioFile: true },
		});

		if (!track) {
			throw new BadRequestException('Track not found');
		}

		return track;
	}

	private createQueryGetTrackIds(filter: TrackScanFilter) {
		const { trackIds } = filter;

		return this.trackRepo
			.createQueryBuilder('track')
			.select(['track.id', 'track.scanCopyrightStatus'])
			.leftJoin('track.release', 'release')
			.where('track.id IN (:...ids)', { ids: trackIds });
	}
}
