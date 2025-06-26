import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateOrganizationDspDto,
	QueryGetListOrganizationDspDto,
	UpdateOrganizationDspDto,
} from '../dto/organization.dto';
import { OrganizationDsp } from '../entities/organization-dsp.entity';
import { OrganizationDspValidateService } from './organization-dsp.validate.service';

@Injectable()
export class OrganizationDspService {
	constructor(
		@InjectRepository(OrganizationDsp)
		private readonly OrganizationDspRepo: Repository<OrganizationDsp>,
		private readonly organizationDspValidateService: OrganizationDspValidateService,
	) {}

	async create(
		createOrganizationDspDto: CreateOrganizationDspDto,
	): Promise<OrganizationDsp> {
		const { dspId, organizationId } = createOrganizationDspDto;

		await this.organizationDspValidateService.validate({
			dspId,
			organizationId,
		});

		const organizationDsp = this.OrganizationDspRepo.create(
			createOrganizationDspDto,
		);
		return await this.OrganizationDspRepo.save(organizationDsp);
	}

	async findOne(id: string): Promise<OrganizationDsp> {
		const organizationDsp = await this.OrganizationDspRepo.findOne({
			where: { id },
		});

		if (!organizationDsp) {
			throw new BadRequestException('Not found');
		}

		return organizationDsp;
	}

	async getList(
		query: QueryGetListOrganizationDspDto,
	): Promise<PageDto<OrganizationDsp>> {
		const { page, pageSize, skip } = query;

		const [organizationDsps, totalItems] =
			await this.OrganizationDspRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: organizationDsps,
			metaData: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateOrganizationDspDto: UpdateOrganizationDspDto,
	): Promise<OrganizationDsp> {
		await this.OrganizationDspRepo.update(id, updateOrganizationDspDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.OrganizationDspRepo.delete(id);
	}
}
