// controllers/distribution-channel.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DistributionChannelSuccess } from '../const/distribution-channel.constant';
import {
	CreateDistributionChannelDto,
	GetListDistributionChannelsDto,
	UpdateDistributionChannelDto,
} from '../dto/distribution-channel.dto';
import { DistributionChannelService } from '../services/distribution-channel.service';

@ApiTags('Distribution Channels')
@SystemAdminOnly()
@Controller('distribution-channels')
export class DistributionChannelController {
	constructor(
		private readonly distributionChannelService: DistributionChannelService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create distribution channel' })
	async create(
		@Body() data: CreateDistributionChannelDto,
		@UserId() userId: string,
	) {
		const result = await this.distributionChannelService.create({
			data,
			userId,
		});

		return DistributionChannelSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update distribution channel' })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateDistributionChannelDto,
		@UserId() userId: string,
	) {
		const result = await this.distributionChannelService.update({
			id,
			data,
			userId,
		});

		return DistributionChannelSuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get distribution channel detail' })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.distributionChannelService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get list distribution channels' })
	async getList(@Query() query: GetListDistributionChannelsDto) {
		const result = await this.distributionChannelService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete distribution channel' })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.distributionChannelService.delete(id);
		return DistributionChannelSuccess.DELETE();
	}
}
