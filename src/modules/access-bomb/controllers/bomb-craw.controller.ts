import { Controller, Get, Query } from '@nestjs/common';
import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import { TrackBombCrawlService } from '../services/bom-craw.service';

@Controller('bomb-craw')
export class BombCrawController {
	constructor(private readonly service: TrackBombCrawlService) {}

	@PublicRoute()
	@Get('crawl-track-metadata')
	async crawlTrackMetadata(@Query('token') token: string) {
		return this.service.crawlMissingMetadata(token);
	}

	@PublicRoute()
	@Get('crawl-release-metadata')
	async crawlReleaseMetadata(@Query('token') token: string) {
		return this.service.crawlMissingReleaseMetadata(token);
	}
}
