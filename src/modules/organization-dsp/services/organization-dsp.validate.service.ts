import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { Repository } from 'typeorm';

@Injectable()
export class OrganizationDspValidateService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		@InjectRepository(Organization)
		private readonly organizationRepo: Repository<Organization>,
	) {}

	async validate({
		dspId,
		organizationId,
	}: {
		dspId: string;
		organizationId: string;
	}) {
		const dsp = await this.dspRepo.findOne({ where: { id: dspId } });
		const organization = await this.organizationRepo.findOne({
			where: { id: organizationId },
		});

		if (!dsp || !organization) {
			throw new NotFoundException('Dsp or Organization not found');
		}

		return true;
	}
}
