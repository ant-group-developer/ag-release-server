import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QueryGetListTrackRevenueDto } from '../dto/track-revenue.dto';
import { TrackRevenueDataService } from '../services/track-revenue.data.service';
import { TrackRevenueService } from '../services/track-revenue.service';

@Controller('track-revenue')
export class TrackRevenueController {
	constructor(
		private readonly trackRevenueDataService: TrackRevenueDataService,
		private readonly trackRevenueService: TrackRevenueService,
	) {}

	@Post('import')
	async importFromFile(@Body('filePath') filePath: string) {
		return this.trackRevenueDataService.importFromFile(filePath);
	}

	@Get()
	private getList(@Query() query: QueryGetListTrackRevenueDto) {
		return this.trackRevenueService.getList(query);
	}
}
