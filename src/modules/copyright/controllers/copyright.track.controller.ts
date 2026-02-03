import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CompareHistoryScanDto } from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('tracks/:id/copyright')
export class CopyrightTrackController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	async scanCopyright(@Param('id') id: string) {
		const result = await this.copyrightService.scanTrackCopyright({
			trackId: id,
		});
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getResultOfTrack(@Param('id') trackId: string) {
		const result = await this.copyrightService.getResultOfTrack(trackId);
		return new ResponseSuccess({ data: result });
	}

	@Post('compare')
	async compareResultOfTrack(@Body() payload: CompareHistoryScanDto) {
		const result =
			await this.copyrightService.compareResultOfTrack(payload);
		return new ResponseSuccess({ data: result });
	}
}
