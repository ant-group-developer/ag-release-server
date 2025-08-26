import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { LabelMessageError, LabelMessages } from '../constants/label.constant';
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
	async create(data: CreateLabelDto, tenantId: string): Promise<Label> {
		await this.labelQueryService.validate({
			where: { name: data.name, tenantId },
		});

		const label = this.labelRepo.create({ ...data, tenantId: tenantId });
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
			await this.labelQueryService.validate({
				where: { name: data.name, tenantId: label.tenantId },
			});
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
		this.labelQueryService.validateDelete(label);

		if (label.picture) {
			await this.bucketService.deletePublicFile(label.picture);
		}

		await this.labelRepo.delete(id);
	}

	async checkExceedLabels(tenantId: string) {
		const { label_count, max_label_count } = await this.labelRepo
			.createQueryBuilder('label')
			.leftJoin('label.tenant', 'tenant')
			.select([
				'COUNT(label.id) AS label_count',
				'tenant.maxLabels AS max_label_count',
				'tenant.id AS tenant_id',
			])
			.groupBy('tenant.id')
			.where('tenant.id = :tenantId', { tenantId })
			.getRawOne();

		if (Number(label_count) >= Number(max_label_count)) {
			throw new ResponseError(LabelMessages.LIMIT_EXCEEDED);
		}
	}
}
