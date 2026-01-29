// src/modules/aggregators/services/aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConfigsService } from '../../sftp-configs/services/sftp-config.service';
import { AggregatorException } from '../const/aggregator.const';
import {
	CreateAggregatorDto,
	GetListAggregatorDto,
	UpdateAggregatorDto,
} from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';
import { AggregatorQueryService } from './aggregator.query.service';

@Injectable()
export class AggregatorsService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly repo: Repository<Aggregator>,
		private readonly queryService: AggregatorQueryService,

		private readonly sftpConfigsService: SftpConfigsService,
	) {}

	async create({
		data,
		userId,
	}: {
		data: CreateAggregatorDto;
		userId: string;
	}) {
		const { sftpConfig, ...rest } = data;

		await this.validateUnique({ code: data.code, name: data.name });

		const queryRunner = await newTransaction(this.repo);

		try {
			const { manager } = queryRunner;

			const aggregatorRepo = manager.getRepository(Aggregator);

			const entity = aggregatorRepo.create({
				...rest,
				creatorId: userId,
				modifierId: userId,
			});

			if (data.isDefault) {
				await this.resetDefault({ manager });
			}

			const aggregator = await aggregatorRepo.save(entity);

			if (sftpConfig) {
				await this.sftpConfigsService.upsert({
					userId,
					data: { ...sftpConfig, aggregatorId: aggregator.id },
					manager,
				});
			}

			await queryRunner.commitTransaction();

			return this.findOne(aggregator.id);
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}

	async getList(filter: GetListAggregatorDto) {
		return this.queryService.getList(filter);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { sftpConfig: true },
		});
		if (!entity) throw AggregatorException.NOT_FOUND();
		return entity;
	}

	async getDefault() {
		const entity = await this.repo.findOne({
			where: { isActive: true, isDefault: true },
		});
		if (!entity) throw AggregatorException.NOT_FOUND_DEFAULT();
		return entity;
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateAggregatorDto;
		userId: string;
	}) {
		// Bắt đầu transaction
		const queryRunner = await newTransaction(this.repo);

		try {
			const { manager } = queryRunner;

			const aggregatorRepo = manager.getRepository(Aggregator);
			const entity = await aggregatorRepo.findOne({ where: { id } });

			// Nếu không tìm thấy entity
			if (!entity) throw AggregatorException.NOT_FOUND();

			const { sftpConfig, ...rest } = data;

			// Kiểm tra tính duy nhất cho code và name
			await this.validateUnique({
				idExclude: id,
				code: data.code,
				name: data.name,
			});

			if (
				(data.isActive === false && data.isDefault) || // bản ghi mới là default nhưng ko active
				(data.isActive === false && entity.isDefault) || // bản ghi trong db là default, nhưng tắt active
				(data.isDefault === false && entity.isDefault) // ko được tắt default của bản ghi đang default
			) {
				throw AggregatorException.DEFAULT_ACTIVE_ERROR();
			}

			// Nếu isDefault được thiết lập, reset các default cũ
			if (data.isDefault) {
				await this.resetDefault({ manager });
			}

			// Cập nhật thông tin của aggregator
			await aggregatorRepo.update(
				{ id },
				{
					...rest,
					modifierId: userId, // Cập nhật modifierId khi thay đổi
				},
			);

			// Nếu có cập nhật về SFTP config, xử lý
			if (sftpConfig) {
				await this.sftpConfigsService.upsert({
					userId,
					data: { ...sftpConfig, aggregatorId: id },
					manager,
				});
			}

			// Commit transaction
			await queryRunner.commitTransaction();

			// Trả về kết quả sau khi cập nhật
			return this.findOne(id);
		} catch (e) {
			// Rollback transaction nếu có lỗi
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			// Release queryRunner
			await queryRunner.release();
		}
	}

	// async incrementDspUsageCount(id: string): Promise<void> {
	// 	await this.repo
	// 		.createQueryBuilder()
	// 		.update(Aggregator)
	// 		.set({ dspUsageCount: () => 'dspUsageCount + 1' }) // Cộng 1 vào dspUsageCount
	// 		.where('id = :id', { id })
	// 		.execute();
	// }

	// // Hàm trừ 1 từ dspUsageCount
	// async decrementDspUsageCount(id: string): Promise<void> {
	// 	await this.repo
	// 		.createQueryBuilder()
	// 		.update(Aggregator)
	// 		.set({ dspUsageCount: () => 'dspUsageCount - 1' }) // Trừ 1 từ dspUsageCount
	// 		.where('id = :id', { id })
	// 		.execute();
	// }

	async resetDefault({ manager }: { manager?: EntityManager }) {
		const repo = this.getDeliveryAggregatorRepo(manager);
		await repo.update({ isDefault: true }, { isDefault: false });
	}

	async delete({ id, userId }: { id: string; userId: string }) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw AggregatorException.NOT_FOUND();

		await this.repo.update({ id }, { modifierId: userId });
		await this.repo.delete({ id });

		return { id };
	}

	private async validateUnique({
		idExclude,
		code,
		name,
	}: {
		idExclude?: string;
		code?: string;
		name?: string;
	}) {
		if (code) {
			const existCode = await this.repo.findOne({
				where: {
					code,
					...(idExclude ? { id: Not(idExclude) } : {}),
				},
			});
			if (existCode) throw AggregatorException.CODE_EXISTED();
		}

		if (name) {
			const existName = await this.repo.findOne({
				where: {
					name,
					...(idExclude ? { id: Not(idExclude) } : {}),
				},
			});
			if (existName) throw AggregatorException.NAME_EXISTED();
		}
	}

	protected getDeliveryAggregatorRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(Aggregator) : this.repo;
	}
}
