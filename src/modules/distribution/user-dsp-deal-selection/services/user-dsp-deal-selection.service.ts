import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Repository } from 'typeorm';
import { DspDealConfigEntity } from '../../dsp-deal-config/entities/dsp-deal-config.entity';
import { DspDealConfigScope } from '../../dsp-deal-config/enum/dsp-deal-config.enum';
import { UserDspDealSelectionException } from '../const/user-dsp-deal-selection.const';
import {
	CreateUserDspDealSelectionDto,
	GetListUserDspDealSelectionDto,
	UpdateUserDspDealSelectionDto,
} from '../dto/user-dsp-deal-selection.dto';
import { UserDspDealSelectionEntity } from '../entities/user-dsp-deal-selection.entity';
import { UserDspDealSelectionMode } from '../enum/user-dsp-deal-selection.enum';
import { UserDspDealSelectionQueryService } from './user-dsp-deal-selection.query.service';

@Injectable()
export class UserDspDealSelectionService {
	constructor(
		@InjectRepository(UserDspDealSelectionEntity)
		private readonly repo: Repository<UserDspDealSelectionEntity>,

		private readonly queryService: UserDspDealSelectionQueryService,

		@InjectRepository(DspDealConfigEntity)
		private readonly dspDealConfigRepo: Repository<DspDealConfigEntity>,
	) {}

	async create({ data }: { data: CreateUserDspDealSelectionDto }) {
		this.validateModeRules(data.mode, data.overrideConfigId);

		const existed = await this.repo.findOne({
			where: { userId: data.userId, dspId: data.dspId },
		});
		if (existed) throw UserDspDealSelectionException.ALREADY_EXISTS();

		await this.validateOverrideConfigIfNeeded(data);

		const entity = this.repo.create({
			userId: data.userId,
			dspId: data.dspId,
			dealTypeId: data.dealTypeId,
			mode: data.mode,
			overrideConfigId: data.overrideConfigId ?? null,
		});

		const tx = await newTransaction(this.repo);
		try {
			const { manager } = tx;
			const txRepo = manager.getRepository(UserDspDealSelectionEntity);

			await txRepo.save(entity);

			await tx.commitTransaction();
			return this.findOne({ userId: data.userId, dspId: data.dspId });
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async findOne(key: { userId: string; dspId: string }) {
		const row = await this.repo.findOne({
			where: { userId: key.userId, dspId: key.dspId },
			relations: {
				user: true,
				dsp: true,
				dealType: true,
				overrideConfig: true,
			},
		});
		if (!row) throw UserDspDealSelectionException.NOT_FOUND();
		return row;
	}

	async update({
		key,
		data,
	}: {
		key: { userId: string; dspId: string };
		data: UpdateUserDspDealSelectionDto;
	}) {
		const current = await this.findOne(key);

		const nextMode = data.mode ?? current.mode;
		const nextOverride =
			data.overrideConfigId !== undefined
				? data.overrideConfigId
				: current.overrideConfigId;

		this.validateModeRules(nextMode, nextOverride);

		const merged: CreateUserDspDealSelectionDto = {
			userId: current.userId,
			dspId: current.dspId,
			dealTypeId: data.dealTypeId ?? current.dealTypeId,
			mode: nextMode,
			overrideConfigId: nextOverride ?? null,
		};

		await this.validateOverrideConfigIfNeeded(merged);

		const tx = await newTransaction(this.repo);
		try {
			const { manager } = tx;
			const txRepo = manager.getRepository(UserDspDealSelectionEntity);

			await txRepo.update(
				{ userId: key.userId, dspId: key.dspId },
				{
					dealTypeId: merged.dealTypeId,
					mode: merged.mode,
					overrideConfigId: merged.overrideConfigId ?? null,
				},
			);

			await tx.commitTransaction();
			return this.findOne(key);
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async getList(filter: GetListUserDspDealSelectionDto) {
		return this.queryService.getList(filter);
	}

	async delete(key: { userId: string; dspId: string }) {
		await this.findOne(key);
		await this.repo.delete({ userId: key.userId, dspId: key.dspId });
	}

	private validateModeRules(
		mode: UserDspDealSelectionMode,
		overrideConfigId?: string | null,
	) {
		if (mode === UserDspDealSelectionMode.USE_OVERRIDE) {
			if (!overrideConfigId)
				throw UserDspDealSelectionException.OVERRIDE_REQUIRED();
		}
		if (mode === UserDspDealSelectionMode.USE_DEFAULT) {
			if (overrideConfigId)
				throw UserDspDealSelectionException.OVERRIDE_MUST_BE_NULL();
		}
	}

	private async validateOverrideConfigIfNeeded(
		data: CreateUserDspDealSelectionDto,
	) {
		if (data.mode !== UserDspDealSelectionMode.USE_OVERRIDE) return;

		// overrideConfigId phải thuộc đúng user + dsp + dealType + scope=USER_OVERRIDE
		const cfg = await this.dspDealConfigRepo.findOne({
			where: {
				id: data.overrideConfigId as any,
				userId: data.userId,
				dspId: data.dspId,
				dealTypeId: data.dealTypeId,
				scope: DspDealConfigScope.USER_OVERRIDE,
			} as any,
		});

		if (!cfg) throw UserDspDealSelectionException.INVALID_OVERRIDE_CONFIG();
	}
}
