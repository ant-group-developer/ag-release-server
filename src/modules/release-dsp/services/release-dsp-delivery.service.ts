// services/release-dsp-delivery.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ReleaseDspDeliveryException } from '../constants/release-dsp.constant';
import {
	CreateReleaseDspDeliveryDto,
	GetListReleaseDspDeliveriesDto,
	UpdateReleaseDspDeliveryDto,
} from '../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../entities/release-dsp.entity';
import { ReleaseDspDeliveryQueryService } from './release-dsp-delivery-query.service';

@Injectable()
export class ReleaseDspDeliveryService {
	constructor(
		@InjectRepository(ReleaseDspDelivery)
		private readonly repo: Repository<ReleaseDspDelivery>,
		private readonly queryService: ReleaseDspDeliveryQueryService,
	) {}

	async create(input: {
		data: CreateReleaseDspDeliveryDto;

		manager?: EntityManager;
	}) {
		const { data, manager } = input;
		const repo = this.getRepo(manager);

		await this.validateUnique(data, manager);

		const entity = repo.create({
			...data,
		});

		return repo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOneBy({ id });
		if (!entity) throw ReleaseDspDeliveryException.NOT_FOUND();
		return entity;
	}

	async update(input: {
		id: string;
		data: UpdateReleaseDspDeliveryDto;
		manager?: EntityManager;
	}) {
		const { id, data, manager } = input;
		const repo = this.getRepo(manager);

		await this.findOne(id);

		// unique check only when releaseId + dspId both provided in update
		if (data.releaseId && data.dspId) {
			await this.validateUnique(
				{ releaseId: data.releaseId, dspId: data.dspId },
				manager,
				id,
			);
		}

		await repo.update(id, {
			...data,
		});

		return this.findOne(id);
	}

	async getList(filter: GetListReleaseDspDeliveriesDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
	}

	private async validateUnique(
		data: Pick<CreateReleaseDspDeliveryDto, 'releaseId' | 'dspId'>,
		manager?: EntityManager,
		excludeId?: string,
	) {
		const repo = this.getRepo(manager);
		const existed = await repo.findOne({
			where: {
				releaseId: data.releaseId,
				dspId: data.dspId,
			},
		});

		if (existed && existed.id !== excludeId) {
			throw ReleaseDspDeliveryException.DUPLICATED();
		}
	}

	protected getRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(ReleaseDspDelivery) : this.repo;
	}
}
