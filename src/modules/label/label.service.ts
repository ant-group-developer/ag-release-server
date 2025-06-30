import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	LabelMessageCodeError,
	LabelMessageError,
} from './constants/label.constant';
import {
	CreateLabelDto,
	QueryGetListLabelDto,
	UpdateLabelDto,
} from './dto/label.dto';
import { Label } from './entities/label.entity';

@Injectable()
export class LabelService {
	constructor(
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
	) {}

	async create(createLabelDto: CreateLabelDto): Promise<Label> {
		await this.validate({ name: createLabelDto.name });

		const label = this.labelRepo.create(createLabelDto);
		return await this.labelRepo.save(label);
	}

	async findOne(id: string): Promise<Label> {
		const label = await this.labelRepo.findOne({ where: { id } });
		if (!label) {
			throw new BadRequestException('Not found');
		}

		return label;
	}

	async getList(query: QueryGetListLabelDto): Promise<PageDto<Label>> {
		const { page, pageSize, skip } = query;

		const [labels, totalItems] = await this.labelRepo.findAndCount({
			skip,
			take: pageSize,
		});

		return new PageDto({
			items: labels,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, updateLabelDto: UpdateLabelDto): Promise<Label> {
		const label = await this.findOne(id);

		if (label.name !== updateLabelDto.name) {
			await this.validate({ name: updateLabelDto.name });
		}

		await this.labelRepo.update(id, updateLabelDto);

		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.labelRepo.delete(id);
	}

	async validate({ name }: { name: string }) {
		if (name) {
			const artist = await this.labelRepo.findOne({ where: { name } });

			if (artist) {
				throw new ResponseError({
					message: LabelMessageError.DUPLICATE_NAME_LABEL,
					messageCode: LabelMessageCodeError.DUPLICATE_NAME_LABEL,
					statusCode: 409,
				});
			}
		}
	}
}
