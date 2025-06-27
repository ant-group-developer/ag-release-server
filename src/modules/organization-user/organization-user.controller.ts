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
	): Promise<ResponseSuccess<OrganizationUser>> {
		const result = await this.organizationUserService.create(
			createOrganizationUserDto,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<OrganizationUser>> {
		const result = await this.organizationUserService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListOrganizationUserDto,
	): Promise<ResponseSuccess<PageDto<OrganizationUser>>> {
		const result = await this.organizationUserService.getList(query);
		return new ResponseSuccess({ data: result });
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
