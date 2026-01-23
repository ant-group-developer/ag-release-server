import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListUserDspDealSelectionDto } from '../dto/user-dsp-deal-selection.dto';
import { UserDspDealSelectionEntity } from '../entities/user-dsp-deal-selection.entity';

@Injectable()
export class UserDspDealSelectionQueryService {
	constructor(
		@InjectRepository(UserDspDealSelectionEntity)
		private readonly repo: Repository<UserDspDealSelectionEntity>,
	) {}

	async getList(filter: GetListUserDspDealSelectionDto) {
		const qb = this.createQb(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: filter,
		});
	}

	private createQb(filter: GetListUserDspDealSelectionDto) {
		const qb = this.repo.createQueryBuilder('sel');

		qb.leftJoinAndSelect('sel.user', 'user');
		qb.leftJoinAndSelect('sel.dsp', 'dsp');
		qb.leftJoinAndSelect('sel.dealType', 'dealType');
		qb.leftJoinAndSelect('sel.overrideConfig', 'overrideConfig');

		this.applyFilter({ qb, filter });

		qb.skip(filter.skip).take(filter.limit);
		qb.orderBy('sel.updatedAt', 'DESC');

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<UserDspDealSelectionEntity>;
		filter: GetListUserDspDealSelectionDto;
	}) {
		const { userId, dspId, dealTypeId, mode } = filter;

		if (userId) qb.andWhere('sel.userId = :userId', { userId });
		if (dspId) qb.andWhere('sel.dspId = :dspId', { dspId });
		if (dealTypeId)
			qb.andWhere('sel.dealTypeId = :dealTypeId', { dealTypeId });
		if (mode) qb.andWhere('sel.mode = :mode', { mode });
	}
}
