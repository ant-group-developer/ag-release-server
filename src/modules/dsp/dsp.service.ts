import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from './dto/dsp.dto';
import { Dsp } from './entities/dsp.entity';

@Injectable()
export class DspService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	async create(createDspDto: CreateDspDto): Promise<Dsp> {
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
		const { page, pageSize, skip } = query;

		const [dsps, totalItems] = await this.dspRepo.findAndCount({
			skip,
			take: pageSize,
			relations: ['creator', 'modifier'],
			// select: {
			// 	creator: {
			// 		id: true,
			// 		email: true,
			// 		name: true,
			// 	},
			// 	modifier: {
			// 		id: true,
			// 		email: true,
			// 		name: true,
			// 	},
			// },
		});

		return new PageDto({
			items: dsps,
			metaData: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, updateDspDto: UpdateDspDto): Promise<Dsp> {
		await this.dspRepo.update(id, updateDspDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.dspRepo.delete(id);
	}
}
