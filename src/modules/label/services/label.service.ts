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

	// create
	async create(data: CreateLabelDto): Promise<Label> {
		await this.validate({ name: data.name });

		const label = this.labelRepo.create(data);
		return await this.labelRepo.save(label);
	}

	// read
	private async findOne(id: string): Promise<Label> {
		const label = await this.labelRepo.findOne({ where: { id } });
		if (!label) {
			throw new ResponseError({
				message: LabelMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return label;
	}

	async findOneWithCountRelation(id: string): Promise<Label> {
		const label = await this.labelQueryService.findOneWithCountRelation(id);
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

	// update
	async update(id: string, data: UpdateLabelDto): Promise<Label> {
		const { name, picture } = data;

		const label = await this.findOne(id);

		if (name && name !== label.name) {
			await this.validate({ name: data.name });
		}

		if (
			picture !== undefined &&
			picture !== label.picture &&
			label.picture
		) {
			await this.bucketService.deletePublicFile(label.picture);
		}

		await this.labelRepo.update(id, data);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const label = await this.findOneWithCountRelation(id);

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
