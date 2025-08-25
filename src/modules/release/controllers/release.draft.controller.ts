import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	ReleaseMessageCodeSuccess,
	ReleaseMessageSuccess,
} from '../constants/release.constant';

import { Request } from 'express';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseDraftService } from '../services/release.draft.service';

@ApiTags('Releases Draft')
@Controller('releases/draft')
export class ReleaseDraftController {
	constructor(private readonly releaseDraftService: ReleaseDraftService) {}

	@Post()
	async create(@Body() data: CreateReleaseDraftDto, @Req() req: Request) {
		const result = await this.releaseDraftService.create(
			data,
			req.user!.tenantId,
		);

		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateReleaseDraftDto,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const result = await this.releaseDraftService.update(id, data);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.UPDATE,
		});
	}

	@Get(':id/validate')
	async validateSchemaRelease(@Param('id') id: string) {
		const result = await this.releaseDraftService.validateSchemaRelease(id);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a release by ID' })
	@ApiResponse({
		status: 200,
		description: ReleaseMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseDraftService.handleDeleteSafe(id);
		return new ResponseSuccess({
			messageCode: ReleaseMessageCodeSuccess.DELETE,
		});
	}
}
