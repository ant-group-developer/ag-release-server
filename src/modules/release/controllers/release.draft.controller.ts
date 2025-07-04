import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { ReleaseMessageCodeSuccess } from '../constants/release.constant';

import {
	CreateDraftReleaseDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseDraftService } from '../services/release.draft.service';

@ApiTags('Releases Draft')
@Controller('releases/draft')
export class ReleaseDraftController {
	constructor(private readonly releaseDraftService: ReleaseDraftService) {}

	@Post()
	async create(
		@Body() data: CreateDraftReleaseDto,
	): Promise<ResponseSuccess<Release>> {
		const result = await this.releaseDraftService.create(data);

		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateReleaseDraftDto,
	): Promise<ResponseSuccess<Release>> {
		const result = await this.releaseDraftService.update(id, data);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.UPDATE,
		});
	}
}
