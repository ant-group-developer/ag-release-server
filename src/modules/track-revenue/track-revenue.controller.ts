import { Body, Controller, Post } from '@nestjs/common';
import { TrackRevenueService } from './track-revenue.service';

@Controller('track-revenue')
export class TrackRevenueController {
	constructor(private readonly trackRevenueService: TrackRevenueService) {}

	@Post('import')
	async importFromFile(@Body('filePath') filePath: string) {
		return this.trackRevenueService.importFromFile(filePath);
	}
}
