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
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	BulkUpsertReleaseCaptionsDto,
	CreateReleaseCaptionDto,
	UpdateReleaseCaptionDto,
} from './dto/release-caption.dto';
import { ReleaseCaptionType } from './entities/release-caption.entity';
import { ReleaseCaptionService } from './release-caption.service';

@ApiTags('Release Captions')
@Controller('releases')
export class ReleaseCaptionController {
	constructor(private readonly captionService: ReleaseCaptionService) {}

	@Post(':releaseId/release-captions')
	@ApiOperation({
		summary: 'Create or replace a caption by language and type',
	})
	@ApiParam({ name: 'releaseId', format: 'uuid' })
	@ApiBody({ type: CreateReleaseCaptionDto })
	async create(
		@Param('releaseId') releaseId: string,
		@Body() dto: CreateReleaseCaptionDto,
	) {
		const result = await this.captionService.create(releaseId, dto);
		return new ResponseSuccess({ data: result });
	}

	@Post('release-captions/bulk-upsert')
	@ApiOperation({
		summary: 'Bulk upsert captions by releaseId, languageId, and type',
	})
	@ApiBody({ type: BulkUpsertReleaseCaptionsDto })
	@ApiResponse({ status: 200, description: 'Captions upserted' })
	async bulkUpsert(@Body() dto: BulkUpsertReleaseCaptionsDto) {
		const result = await this.captionService.bulkUpsert(dto);
		return new ResponseSuccess({ data: result });
	}

	@Get(':releaseId/release-captions')
	@ApiOperation({ summary: 'Get captions by release ID' })
	@ApiParam({ name: 'releaseId', format: 'uuid' })
	@ApiQuery({ name: 'type', required: false, enum: ReleaseCaptionType })
	async getList(
		@Param('releaseId') releaseId: string,
		@Query('type') type?: ReleaseCaptionType,
	) {
		const result = await this.captionService.getList(releaseId, type);
		return new ResponseSuccess({ data: result });
	}

	@Get('release-captions/:id')
	@ApiOperation({ summary: 'Get one release caption' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async findOne(@Param('id') id: string) {
		const result = await this.captionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put('release-captions/:id')
	@ApiOperation({ summary: 'Update one release caption' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateReleaseCaptionDto })
	async update(
		@Param('id') id: string,
		@Body() dto: UpdateReleaseCaptionDto,
	) {
		const result = await this.captionService.update(id, dto);
		return new ResponseSuccess({ data: result });
	}

	@Delete('release-captions/:id')
	@ApiOperation({ summary: 'Delete one release caption and its bucket file' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async remove(@Param('id') id: string) {
		const result = await this.captionService.remove(id);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':releaseId/release-captions')
	@ApiOperation({ summary: 'Delete all captions of a release' })
	@ApiParam({ name: 'releaseId', format: 'uuid' })
	async deleteByReleaseId(@Param('releaseId') releaseId: string) {
		const result = await this.captionService.deleteByReleaseId(releaseId);
		return new ResponseSuccess({ data: result });
	}
}
