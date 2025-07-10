import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';

import {
	CreateReleaseLanguageDraftDto,
	UpdateReleaseLanguageDraftDto,
} from '../dto/release-language.draft.dto';
import { IReleaseLanguageDraft } from '../interfaces/release-language.interface';
import { ReleaseLanguageDraftService } from '../services/release-language.draft.service';

@ApiTags('ReleaseLanguages Draft')
@Controller('release-languages/draft')
export class ReleaseLanguageDraftController {
	constructor(
		private readonly releaseLanguageDraftService: ReleaseLanguageDraftService,
	) {}

	@Post()
	async create(
		@Body() data: CreateReleaseLanguageDraftDto,
	): Promise<ResponseSuccess<IReleaseLanguageDraft>> {
		const result = await this.releaseLanguageDraftService.create(data);

		return new ResponseSuccess({
			data: result,
			// messageCode: ReleaseLanguageMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateReleaseLanguageDraftDto,
	): Promise<ResponseSuccess<IReleaseLanguageDraft>> {
		const result = await this.releaseLanguageDraftService.update(id, data);
		return new ResponseSuccess({
			data: result,
			// messageCode: ReleaseLanguageMessageCodeSuccess.UPDATE,
		});
	}
}
