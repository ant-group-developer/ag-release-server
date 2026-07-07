import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { CreateYoutubeApiKeyDto } from '../dto/create-api-key.dto';
import { UpdateYoutubeApiKeyDto } from '../dto/update-api-key.dto';
import { YoutubeApiKeyPoolService } from '../services/youtube-api-key-pool.service';
import {
	YoutubeApiKeyPublicView,
	YoutubeApiKeyService,
} from '../services/youtube-api-key.service';

@ApiTags('Admin - YouTube API Keys')
@Controller('admin/youtube-api-keys')
@SystemAdminOnly()
export class YoutubeApiKeyAdminController {
	constructor(
		private readonly keyService: YoutubeApiKeyService,
		private readonly poolService: YoutubeApiKeyPoolService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Add new YouTube API key' })
	async create(
		@Body() dto: CreateYoutubeApiKeyDto,
	): Promise<ResponseSuccess<YoutubeApiKeyPublicView>> {
		const data = await this.keyService.create(dto);
		return new ResponseSuccess({ data });
	}

	@Get()
	@ApiOperation({
		summary: 'List all YouTube API keys (no plaintext exposed)',
	})
	async findAll(): Promise<ResponseSuccess<YoutubeApiKeyPublicView[]>> {
		const data = await this.keyService.findAll();
		return new ResponseSuccess({ data });
	}

	@Get('stats')
	@ApiOperation({
		summary: 'Pool stats: quota consumed per key today, total remaining',
	})
	async stats(): Promise<
		ResponseSuccess<ReturnType<YoutubeApiKeyPoolService['getPoolStats']>>
	> {
		return new ResponseSuccess({ data: this.poolService.getPoolStats() });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get one YouTube API key by id' })
	async findOne(
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseSuccess<YoutubeApiKeyPublicView>> {
		const data = await this.keyService.findOne(id);
		return new ResponseSuccess({ data });
	}

	@Patch(':id')
	@ApiOperation({
		summary: 'Update alias / status (active|disabled) / dailyQuotaLimit',
	})
	async update(
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() dto: UpdateYoutubeApiKeyDto,
	): Promise<ResponseSuccess<YoutubeApiKeyPublicView>> {
		const data = await this.keyService.update(id, dto);
		return new ResponseSuccess({ data });
	}

	@Delete(':id')
	@HttpCode(200)
	@ApiOperation({ summary: 'Hard delete a YouTube API key' })
	async remove(
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseSuccess<{ deleted: true }>> {
		await this.keyService.remove(id);
		return new ResponseSuccess({ data: { deleted: true } });
	}

	@Post(':id/reset-quota')
	@ApiOperation({ summary: 'Force reset units_consumed_today = 0 (debug)' })
	async resetQuota(
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseSuccess<YoutubeApiKeyPublicView>> {
		const data = await this.keyService.resetQuota(id);
		return new ResponseSuccess({ data });
	}
}
