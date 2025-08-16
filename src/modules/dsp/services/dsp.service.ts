import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { DspMessageError } from '../constants/dsp.constant';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';
import { DspQueryService } from './dsp.query.service';

@Injectable()
export class DspService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly bucketService: BucketService,
		private readonly dspQueryService: DspQueryService,
	) {}

	// create
	async create(createDspDto: CreateDspDto): Promise<Dsp> {
		await this.dspQueryService.validate({ name: createDspDto.name });
		const dsp = this.dspRepo.create(createDspDto);
		return await this.dspRepo.save(dsp);
	}

	// read
	async findOne(id: string): Promise<Dsp> {
		const dsp = await this.dspRepo.findOne({ where: { id } });
		if (!dsp) {
			throw new ResponseError({ message: DspMessageError.NOT_FOUND });
		}

		return dsp;
	}

	private async findOneWithCountRelation(id: string): Promise<Dsp> {
		const dsp = await this.dspQueryService.findOneWithCountRelation(id);
		if (!dsp) {
			throw new ResponseError({ message: DspMessageError.NOT_FOUND });
		}

		return dsp;
	}

	async getList(query: QueryGetListDspDto): Promise<PageDto<Dsp>> {
		const { page, pageSize } = query;

		const queryGetList = this.dspQueryService.createQueryGetList(query);

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

	// update
	async update(id: string, updateDspDto: UpdateDspDto): Promise<Dsp> {
		const { name, picture } = updateDspDto;
		const dsp = await this.findOne(id);

		if (name && name !== dsp.name) {
			await this.dspQueryService.validate({ name });
		}

		if (picture !== undefined && picture !== dsp.picture && dsp.picture) {
			await this.bucketService.deletePublicFile(dsp.picture);
		}

		await this.dspRepo.update(id, updateDspDto);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const dsp = await this.findOneWithCountRelation(id);
		this.dspQueryService.validateDelete(dsp);
		if (dsp.picture) {
			await this.bucketService.deletePublicFile(dsp.picture);
		}
		await this.dspRepo.delete(id);
	}
}
