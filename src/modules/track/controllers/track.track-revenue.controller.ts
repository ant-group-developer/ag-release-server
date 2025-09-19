import { Controller, Get } from '@nestjs/common';
import { TrackService } from '../services/track.service';

@Controller('track')
export class TrackTrackRevenueController {
	constructor(private readonly trackService: TrackService) {}

	@Get('track-revenue')
	getListTrackRevenue() {}
}
