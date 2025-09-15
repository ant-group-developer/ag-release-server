import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TrackPolicyDspService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	async getListDspEnablePolicy(): Promise<
		{ dspId: string; actionId: string | null }[]
	> {
		const data = await this.dspRepo
			.createQueryBuilder('dsp')
			.leftJoinAndSelect(
				'dsp.dspActions',
				'dspAction',
				'dspAction.isDefault = :isDefault',
				{ isDefault: true },
			)
			.where('dsp.isActive = :isActive', { isActive: true })
			.andWhere('dsp.enablePolicy = :enablePolicy', {
				enablePolicy: true,
			})
			.getMany();

		return data.map((dsp) => ({
			dspId: dsp.id,
			actionId: dsp.dspActions[0]?.actionId ?? null,
		}));
	}
}
