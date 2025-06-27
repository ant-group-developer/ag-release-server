import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateOrganizationDto,
	QueryGetListOrganizationDto,
	UpdateOrganizationDto,
} from './dto/organization.dto';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationService {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepo: Repository<Organization>,
	) {}

	async create(
		createOrganizationDto: CreateOrganizationDto,
	): Promise<Organization> {
		const Organization = this.organizationRepo.create(
			createOrganizationDto,
		);
		return await this.organizationRepo.save(Organization);
	}

	async findOne(id: string): Promise<Organization> {
		const organization = await this.organizationRepo.findOne({
			where: { id },
		});

		if (!organization) {
			throw new BadRequestException('Not found');
		}

		return organization;
	}

	async getList(
		query: QueryGetListOrganizationDto,
	): Promise<PageDto<Organization>> {
		const { page, pageSize, skip } = query;

		const [organizations, totalItems] =
			await this.organizationRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: organizations,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateOrganizationDto: UpdateOrganizationDto,
	): Promise<Organization> {
		await this.organizationRepo.update(id, updateOrganizationDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.organizationRepo.delete(id);
	}
}
