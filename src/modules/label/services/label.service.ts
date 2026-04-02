import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { stringToCode } from 'src/utils/util';
import { Not, Repository } from 'typeorm';
import { LabelMessage } from '../constants/label.constant';
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

		private readonly bucketService: BucketService2,
		private readonly labelQueryService: LabelQueryService,
	) {}

	// create
	async create(
		data: CreateLabelDto,
		tenantId: string,
		userId: string,
	): Promise<Label> {
		const code = stringToCode(data.name);

		await this.validateUnique({
			name: data.name,
			code,
			tenantId,
		});

		const label = this.labelRepo.create({
			...data,
			code,
			tenantId: tenantId,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.labelRepo.save(label);
	}

	// read
	private async findOne(id: string): Promise<Label> {
		const label = await this.labelRepo.findOne({ where: { id } });
		if (!label) {
			throw new ResponseError(LabelMessage.NOT_FOUND);
		}

		return label;
	}

	async findOneWithCountRelation(id: string): Promise<Label> {
		const label = await this.labelQueryService.findOneWithCountRelation(id);
		if (!label) {
			throw new ResponseError(LabelMessage.NOT_FOUND);
		}

		return label;
	}

	async getList(query: QueryGetListLabelDto): Promise<PageDto<Label>> {
		const { page, pageSize } = query;

		const { labels, totalItems } =
			await this.labelQueryService.getList(query);

		return new PageDto({
			items: labels,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(tenantIds?: string[]) {
		return await this.labelQueryService.getListSimple(tenantIds);
	}

	// update
	async update(
		id: string,
		data: UpdateLabelDto,
		userId: string,
	): Promise<Label> {
		const { name, picture } = data;

		const label = await this.findOne(id);

		if (name && name !== label.name) {
			const code = stringToCode(name);
			await this.validateUnique({
				idExclude: id,
				name,
				code,
				tenantId: label.tenantId,
			});
		}

		if (
			picture !== undefined &&
			picture !== label.picture &&
			label.picture
		) {
			await this.bucketService.deletePublicFile(label.picture);
		}

		await this.labelRepo.update(id, { ...data, modifierId: userId });
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
		const data = await this.labelRepo
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

		if (!data) return;

		const { label_count, max_label_count } = data;
		if (Number(label_count) >= Number(max_label_count)) {
			throw new ResponseError(LabelMessage.LIMIT_EXCEEDED);
		}
	}

	private async validateUnique({
		idExclude,
		code,
		name,
		tenantId,
	}: {
		idExclude?: string;
		code?: string;
		name?: string;
		tenantId: string;
	}) {
		if (name) {
			const existName = await this.labelRepo.findOne({
				where: {
					name,
					tenantId,
					...(idExclude ? { id: Not(idExclude) } : {}),
				},
			});
			if (existName) throw new ResponseError(LabelMessage.DUPLICATE_NAME_LABEL);
		}

		if (code) {
			const existCode = await this.labelRepo.findOne({
				where: {
					code,
					tenantId,
					...(idExclude ? { id: Not(idExclude) } : {}),
				},
			});
			if (existCode) throw new ResponseError(LabelMessage.DUPLICATE_CODE_LABEL);
		}
	}
}
