import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DspService } from '../dsp/services/dsp.service';
import { TenantService } from '../tenant/tenant.service';
import { UpdateTenantDspDto } from './tenant-dsp.dto';
import { TenantDsp } from './tenant-dsp.entity';

@Injectable()
export class TenantDspService {
	constructor(
		@InjectRepository(TenantDsp)
		private readonly tenantDspRepository: Repository<TenantDsp>,
		private readonly dspService: DspService,
		private readonly tenantService: TenantService,
	) {}

	async update({ tenantId, data }: UpdateTenantDspDto) {
		await this.dspService.validateExisted(data.map((item) => item.dspId));
		await this.tenantService.validateExisted(tenantId);

		await this.tenantDspRepository.delete({ tenantId });
		const newData = this.tenantDspRepository.create(
			data.map(({ dspId, isActive }) => ({
				tenantId,
				dspId,
				isActive,
			})),
		);
		return this.tenantDspRepository.save(newData);
	}

	async get(tenantId: string) {
		return this.tenantDspRepository.find({
			where: {
				tenantId,
			},
			relations: {
				dsp: true,
			},
			select: {
				id: true,
				tenantId: true,
				isActive: true,
				dsp: {
					id: true,
					name: true,
				},
			},
		});
	}
}
