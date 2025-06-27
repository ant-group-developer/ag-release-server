import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateOrganizationUserDto,
	QueryGetListOrganizationUserDto,
	UpdateOrganizationUserDto,
} from '../dto/organization-user.dto';
import { OrganizationUser } from '../entities/organization-user.entity';
import { OrganizationUserValidateService } from './organization-user.validate.service';

@Injectable()
export class OrganizationUserService {
	constructor(
		@InjectRepository(OrganizationUser)
		private readonly organizationUserRepo: Repository<OrganizationUser>,
		private readonly organizationUserValidateService: OrganizationUserValidateService,
	) {}

	async create(
		createOrganizationUserDto: CreateOrganizationUserDto,
	): Promise<OrganizationUser> {
		const { organizationId, userId } = createOrganizationUserDto;

		await this.organizationUserValidateService.validate({
			organizationId,
			userId,
		});

		const organizationUser = this.organizationUserRepo.create(
			createOrganizationUserDto,
		);
		return await this.organizationUserRepo.save(organizationUser);
	}

	async findOne(id: string): Promise<OrganizationUser> {
		const organizationUser = await this.organizationUserRepo.findOne({
			where: { id },
		});
		if (!organizationUser) {
			throw new BadRequestException('Not found');
		}

		return organizationUser;
	}

	async getList(
		query: QueryGetListOrganizationUserDto,
	): Promise<PageDto<OrganizationUser>> {
		const { page, pageSize, skip } = query;

		const [organizationUsers, totalItems] =
			await this.organizationUserRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: organizationUsers,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateOrganizationUserDto: UpdateOrganizationUserDto,
	): Promise<OrganizationUser> {
		await this.organizationUserRepo.update(id, updateOrganizationUserDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.organizationUserRepo.delete(id);
	}
}
