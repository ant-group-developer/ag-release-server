import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { TrackScanFilter } from '../../interface/copyright.interface';

@Injectable()
export class CopyrightTrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	async updateIsScannedTrack(id: string) {
		await this.trackRepo.update({ id }, { isScanned: true });
	}

	async getTrackIds(filter: TrackScanFilter) {
		const { ignoreTrackScanned } = filter;

		const query = this.createQueryGetTrackIds(filter);

		const rows = await query.getRawMany<{
			track_id: string;
			track_is_scanned: boolean;
		}>();

		return rows
			.filter((row) => {
				if (ignoreTrackScanned) {
					return row.track_is_scanned === false;
				}

				return true;
			})
			.map((row) => row.track_id);
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
			.select(['track.id', 'track.isScanned'])
			.leftJoin('track.release', 'release')
			.where('track.id IN (:...ids)', { ids: trackIds });
	}
}
