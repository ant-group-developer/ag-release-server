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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { ReleaseContributorSuccess } from './constants/release-contributor.res';
import {
	BulkCreateReleaseContributorDto,
	CreateReleaseContributorDto,
	QueryGetListReleaseContributorDto,
	UpdateReleaseContributorDto,
} from './dto/release-contributor.dto';
import { ReleaseContributorService } from './services/release-contributor.service';

@ApiTags('Release Contributors')
@Controller('release-contributors')
export class ReleaseContributorController {
	constructor(
		private readonly releaseContributorService: ReleaseContributorService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create release contributor' })
	@ApiResponse({ status: 201, description: 'Created' })
	async create(@Body() dto: CreateReleaseContributorDto) {
		const result = await this.releaseContributorService.create(dto);
		return ReleaseContributorSuccess.CREATE(result);
	}

	@Post('bulk')
	@ApiOperation({ summary: 'Bulk create release contributors' })
	@ApiResponse({ status: 201, description: 'Created' })
	async bulkCreate(@Body() dto: BulkCreateReleaseContributorDto) {
		const result = await this.releaseContributorService.bulkCreate(dto);
		return ReleaseContributorSuccess.CREATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get release contributor by id' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Success' })
	async findOne(@Param('id') id: string) {
		const result = await this.releaseContributorService.findOne(id);
		return ReleaseContributorSuccess.COMMON(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list release contributors' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	async getList(@Query() query: QueryGetListReleaseContributorDto) {
		const result = await this.releaseContributorService.getList(query);
		return ReleaseContributorSuccess.COMMON(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update release contributor' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Updated' })
	async update(
		@Param('id') id: string,
		@Body() dto: UpdateReleaseContributorDto,
	) {
		const result = await this.releaseContributorService.update(id, dto);
		return ReleaseContributorSuccess.UPDATE(result);
	}

	@Delete(':id')
	async remove(@Param('id') id: string) {
		await this.releaseContributorService.handleDelete(id);
		return ReleaseContributorSuccess.DELETE();
	}
}
