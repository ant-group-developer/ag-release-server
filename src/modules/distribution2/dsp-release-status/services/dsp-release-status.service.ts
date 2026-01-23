// src/modules/distribution/dsp-release-status/services/dsp-release-status.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { newTransaction } from 'src/utils/utils.transaction';
import { In, Not, Repository } from 'typeorm';
import { DspReleaseStatusException } from '../const/dsp-release-status.const';
import {
	AutoCreateDspReleaseStatusDto,
	CreateDspReleaseStatusDto,
	GetListDspReleaseStatusesDto,
	UpdateDspReleaseStatusDto,
} from '../dto/dsp-release-status.dto';
import { DspReleaseStatus } from '../entities/dsp-release-status.entity';
import { DspReleaseStatusQueryService } from './dsp-release-status.query.service';

@Injectable()
export class DspReleaseStatusService {
	constructor(
		@InjectRepository(DspReleaseStatus)
		private readonly repo: Repository<DspReleaseStatus>,
		private readonly queryService: DspReleaseStatusQueryService,
	) {}

	async getList(filter: GetListDspReleaseStatusesDto) {
		return this.queryService.getList(filter);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DspReleaseStatusException.NOT_FOUND();
		return entity;
	}

	async create({
		data,
		userId,
	}: {
		data: CreateDspReleaseStatusDto;
		userId: string;
	}) {
		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const repo = manager.getRepository(DspReleaseStatus);

			await this.validateUnique(data);

			// validate unique INSIDE transaction
			const existed = await repo.findOne({
				where: {
					dspId: data.dspId,
					releaseId: data.releaseId,
				},
			});

			if (existed) throw DspReleaseStatusException.KEY_EXISTED();

			const entity = repo.create({
				...data,
			});

			await repo.save(entity);

			await transaction.commitTransaction();

			return this.findOne(entity.id);
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async autoCreateByReleaseId({
		releaseId,
		defaultStatus,
		userId,
	}: AutoCreateDspReleaseStatusDto & { userId: string }) {
		const status = defaultStatus ?? ReleaseStatus.DRAFT;

		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRepo = manager.getRepository(DspReleaseStatus);
			const txDspRepo = manager.getRepository(Dsp);

			// lấy tất cả dsp đang active
			const dsps = await txDspRepo.find({
				select: ['id'],
				where: { isActive: true },
			});

			if (!dsps.length) {
				await transaction.commitTransaction();
				return { created: 0, skipped: 0, totalDsp: 0 };
			}

			const dspIds: string[] = dsps.map((d) => d.id);

			// tìm các record đã tồn tại để skip
			const existed: Array<{ dspId: string }> = await txRepo.find({
				select: ['dspId'] as any,
				where: {
					releaseId,
					dspId: In(dspIds),
				},
			});

			const existedSet = new Set<string>(existed.map((x) => x.dspId));

			const toInsert = dspIds
				.filter((dspId) => !existedSet.has(dspId))
				.map((dspId) =>
					txRepo.create({
						dspId,
						releaseId,
						status,
					}),
				);

			if (toInsert.length) {
				await txRepo.save(toInsert);
			}

			await transaction.commitTransaction();

			return {
				created: toInsert.length,
				skipped: existedSet.size,
				totalDsp: dspIds.length,
			};
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateDspReleaseStatusDto;
		userId: string;
	}) {
		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const repo = manager.getRepository(DspReleaseStatus);

			// await this.validateUnique(data);

			const entity = await this.findOne(id);

			// validate unique INSIDE transaction (avoid race condition)
			const conflict = await repo.findOne({
				where: {
					dspId: entity.dspId,
					releaseId: entity.releaseId,
					id: Not(id),
				},
			});
			if (conflict) throw DspReleaseStatusException.KEY_EXISTED();

			Object.assign(entity, data);

			await repo.save(entity);

			await transaction.commitTransaction();

			return this.findOne(entity.id);
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async delete({ id }: { id: string }) {
		await this.repo.delete(id);
	}

	private async validateUnique({
		dspId,
		releaseId,
		exceptId,
	}: {
		dspId: string;
		releaseId: string;
		exceptId?: string;
	}) {
		const existed = await this.repo.findOne({
			where: {
				dspId,
				releaseId,
				...(exceptId ? { id: Not(exceptId) } : {}),
			},
		});
		if (existed) throw DspReleaseStatusException.KEY_EXISTED();
	}

	// private business
}
