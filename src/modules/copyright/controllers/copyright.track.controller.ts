import { Controller, Get, Param, Post } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('tracks/:id/copyright')
export class CopyrightTrackController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	async scanCopyright(@Param('id') id: string) {
		const result = await this.copyrightService.scanTrackCopyright(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getResultOfTrack(@Param('id') id: string) {
		const result = await this.copyrightService.getResultOfTrack(id);
		return new ResponseSuccess({ data: result });
	}
}
