import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { AudioFile } from '../entities/audio-file.entity';

@Injectable()
export class AudioFileQueryService {
	constructor(
		@InjectRepository(AudioFile)
		private readonly audioFileRepo: Repository<AudioFile>,
	) {}

	async findOne(id: string) {
		const audioFile = await this.audioFileRepo.findOne({ where: { id } });

		if (!audioFile) {
			throw new ResponseError({ message: 'Audio file not found' });
		}

		return audioFile;
	}
}
