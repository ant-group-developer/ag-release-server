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
	CreateOrganizationDspDto,
	QueryGetListOrganizationDspDto,
	UpdateOrganizationDspDto,
} from './dto/organization.dto';
import { OrganizationDsp } from './entities/organization-dsp.entity';
import { OrganizationDspService } from './services/organization-dsp.service';

@Controller('organization-dsp')
export class OrganizationDspController {
	constructor(
		private readonly organizationDspService: OrganizationDspService,
	) {}

	@Post()
	async create(
		@Body() createOrganizationDspDto: CreateOrganizationDspDto,
	): Promise<ResponseSuccessDto<OrganizationDsp>> {
		const result = await this.organizationDspService.create(
			createOrganizationDspDto,
		);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<OrganizationDsp>> {
		const result = await this.organizationDspService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListOrganizationDspDto,
	): Promise<ResponseSuccessDto<PageDto<OrganizationDsp>>> {
		const result = await this.organizationDspService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateOrganizationDspDto: UpdateOrganizationDspDto,
	): Promise<OrganizationDsp> {
		return await this.organizationDspService.update(
			id,
			updateOrganizationDspDto,
		);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.organizationDspService.remove(id);
	}
}
