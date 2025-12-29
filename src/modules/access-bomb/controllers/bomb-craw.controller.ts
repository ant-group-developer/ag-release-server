import { Controller, Get, Query } from '@nestjs/common';
import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import { TrackBombCrawlService } from '../services/bom-craw.service';
import { CrawlService_29_12 } from '../services/bom-craw.service.29-12';

@Controller('bomb-craw')
export class BombCrawController {
	constructor(
		private readonly service: TrackBombCrawlService,
		private readonly crawlService_29_12: CrawlService_29_12,
	) {}

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

	@PublicRoute()
	@Get('29-12/crawl-release-metadata')
	async crawlReleaseMetadata_29_12(@Query('token') token: string) {
		return this.crawlService_29_12.crawlAllReleaseMetadata(token);
	}
}
