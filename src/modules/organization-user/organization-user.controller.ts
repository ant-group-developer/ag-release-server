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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
import {
	CreateOrganizationUserDto,
	QueryGetListOrganizationUserDto,
	UpdateOrganizationUserDto,
} from './dto/organization-user.dto';
import { OrganizationUser } from './entities/organization-user.entity';
import { OrganizationUserService } from './services/organization-user.service';

@Controller('organization-user')
export class OrganizationUserController {
	constructor(
		private readonly organizationUserService: OrganizationUserService,
	) {}

	@Post()
	async create(
		@Body() createOrganizationUserDto: CreateOrganizationUserDto,
	): Promise<ResponseSuccessDto<OrganizationUser>> {
		const result = await this.organizationUserService.create(
			createOrganizationUserDto,
		);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<OrganizationUser>> {
		const result = await this.organizationUserService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListOrganizationUserDto,
	): Promise<ResponseSuccessDto<PageDto<OrganizationUser>>> {
		const result = await this.organizationUserService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateOrganizationUserDto: UpdateOrganizationUserDto,
	): Promise<OrganizationUser> {
		return await this.organizationUserService.update(
			id,
			updateOrganizationUserDto,
		);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.organizationUserService.remove(id);
	}
}
