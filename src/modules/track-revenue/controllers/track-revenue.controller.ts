import { Body, Controller, Post } from '@nestjs/common';
import { TrackRevenueDataService } from '../services/track-revenue.data.service';

@Controller('track-revenue')
export class TrackRevenueController {
	constructor(
		private readonly trackRevenueDataService: TrackRevenueDataService,
	) {}

	@Post('import')
	async importFromFile(@Body('filePath') filePath: string) {
		return this.trackRevenueDataService.importFromFile(filePath);
	}
}
