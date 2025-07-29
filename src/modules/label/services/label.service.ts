import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { BucketService } from 'src/modules/bucket/services/bucket.service';
import {
	LabelMessageCodeError,
	LabelMessageError,
} from '../constants/label.constant';
import {
	CreateLabelDto,
	QueryGetListLabelDto,
	UpdateLabelDto,
} from '../dto/label.dto';
import { Label } from '../entities/label.entity';
import { LabelQueryService } from './label.query.service';

@Injectable()
export class LabelService {
	constructor(
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,

		private readonly bucketService: BucketService,
		private readonly labelQueryService: LabelQueryService,
	) {}

	async create(createLabelDto: CreateLabelDto): Promise<Label> {
		await this.validate({ name: createLabelDto.name });

		const label = this.labelRepo.create(createLabelDto);
		return await this.labelRepo.save(label);
	}

	async findOne(id: string): Promise<Label> {
		const label = await this.labelRepo.findOne({ where: { id } });
		if (!label) {
			throw new ResponseError({
				message: LabelMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return label;
	}

	async getList(query: QueryGetListLabelDto): Promise<PageDto<Label>> {
		const { page, pageSize } = query;

		const [labels, totalItems] =
			await this.labelQueryService.getList(query);

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
		const { name, picture } = updateLabelDto;

		const label = await this.findOne(id);

		if (name && name !== label.name) {
			await this.validate({ name: updateLabelDto.name });
		}

		if (
			picture !== undefined &&
			picture !== label.picture &&
			label.picture
		) {
			await this.bucketService.deletePublicFile(label.picture);
		}

		await this.labelRepo.update(id, updateLabelDto);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const label = await this.labelQueryService.findOneWithCountRelation(id);

		if (!label) {
			throw new ResponseError({
				message: 'Artist role not found.',
				statusCode: 404,
			});
		}

		if ((label.releaseCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LabelMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					LabelMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}

		if (label.picture) {
			await this.bucketService.deletePublicFile(label.picture);
		}

		await this.labelRepo.delete(id);
	}

	// validate
	async validate({ name }: { name?: string }) {
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
