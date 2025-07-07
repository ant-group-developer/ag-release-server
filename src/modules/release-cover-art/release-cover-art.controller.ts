import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateReleaseCoverArtDto,
	UpdateReleaseCoverArtDto,
} from './dto/release-cover-art.dto';
import { ReleaseCoverArt } from './entities/release-cover-art.entity';
import { ReleaseCoverArtService } from './services/release-cover-art.service';

@Controller('release-cover-art')
export class ReleaseCoverArtController {
	constructor(
		private readonly releaseCoverArtService: ReleaseCoverArtService,
	) {}

	@Post()
	async create(
		@Body() data: CreateReleaseCoverArtDto,
	): Promise<ResponseSuccess<ReleaseCoverArt>> {
		const result = await this.releaseCoverArtService.create(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateReleaseCoverArtDto,
	): Promise<ResponseSuccess<ReleaseCoverArt>> {
		const result = await this.releaseCoverArtService.update(id, data);

		return new ResponseSuccess({
			data: result,
		});
	}
}
