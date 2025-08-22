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

	async getListWithDefaultActions(): Promise<
		{ dspId: string; actionId: string }[]
	> {
		const data = await this.dspRepo
			.createQueryBuilder('dsp')
			.leftJoinAndSelect(
				'dsp.dspActions',
				'dspAction',
				'dspAction.isDefault = :isDefault',
				{ isDefault: true },
			)
			.where('dspAction.isDefault = :isDefault', { isDefault: true })
			.getMany();

		return data.flatMap((dsp) => {
			const defaultAction = dsp.dspActions[0];
			return defaultAction
				? [{ dspId: dsp.id, actionId: defaultAction.actionId }]
				: [];
		});
	}
}
