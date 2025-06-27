import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateOrganizationDto,
	QueryGetListOrganizationDto,
	UpdateOrganizationDto,
} from './dto/organization.dto';
import { Organization } from './entities/organization.entity';
import { OrganizationService } from './organization.service';

@Controller('organization')
export class OrganizationController {
	constructor(private readonly organizationService: OrganizationService) {}

	@Post()
	async create(
		@Body() createOrganizationDto: CreateOrganizationDto,
	): Promise<ResponseSuccess<Organization>> {
		const result = await this.organizationService.create(
			createOrganizationDto,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Organization>> {
		const result = await this.organizationService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListOrganizationDto,
	): Promise<ResponseSuccess<PageDto<Organization>>> {
		const result = await this.organizationService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateOrganizationDto: UpdateOrganizationDto,
	): Promise<Organization> {
		return await this.organizationService.update(id, updateOrganizationDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.organizationService.remove(id);
	}
}
