import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { BucketGcsService } from '../../bucket/services/bucket.gcs.service';
import {
	DspMessageCodeError,
	DspMessageError,
} from '../constants/dsp.constant';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';
import { DspQbService } from './dsp.qb.service';

@Injectable()
export class DspService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly bucketGcsService: BucketGcsService,
		private readonly dspQbService: DspQbService,
	) {}

	async create(createDspDto: CreateDspDto): Promise<Dsp> {
		await this.validate({ name: createDspDto.name });
		const dsp = this.dspRepo.create(createDspDto);
		return await this.dspRepo.save(dsp);
	}

	async findOne(id: string): Promise<Dsp> {
		const dsp = await this.dspRepo.findOne({ where: { id } });
		if (!dsp) {
			throw new BadRequestException('Not found');
		}

		return dsp;
	}

	async getList(query: QueryGetListDspDto): Promise<PageDto<Dsp>> {
		const { page, pageSize } = query;

		const queryGetList = this.dspQbService.createQueryGetList(query);

		const [dsps, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: dsps,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, updateDspDto: UpdateDspDto): Promise<Dsp> {
		const { name, picture } = updateDspDto;
		const dsp = await this.findOne(id);

		if (name && name !== dsp.name) {
			await this.validate({ name });
		}

		if (picture !== undefined && picture !== dsp.picture && dsp.picture) {
			await this.bucketGcsService.deletePublicFile(dsp.picture);
		}

		await this.dspRepo.update(id, updateDspDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		const dsp = await this.findOne(id);
		if (dsp.picture) {
			await this.bucketGcsService.deletePublicFile(dsp.picture);
		}
		await this.dspRepo.delete(id);
	}

	async validate({ name }: { name?: string }) {
		if (name) {
			const dsp = await this.dspRepo.findOne({
				where: { name },
			});

			if (dsp) {
				throw new ResponseError({
					message: DspMessageError.DUPLICATE_NAME_DSP,
					messageCode: DspMessageCodeError.DUPLICATE_NAME_DSP,
					statusCode: 409,
				});
			}
		}
	}
}
