import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { CiService } from '../services/ci.service';
import { GetCiReleasesDto } from '../dtos/ci.dto';

@Controller('partners/ci/releases')
export class CiReleaseController {
	private readonly logger = new Logger(CiReleaseController.name);

	constructor(private readonly ciService: CiService) {}

	@Get()
	async getReleases(@Query() query: GetCiReleasesDto) {
		return this.ciService.getReleases(query);
	}

	@Get(':id')
	async getReleaseDetail(@Param('id') id: string) {
		return this.ciService.getReleaseDetail(id);
	}

	@Get(':id/qa-flags')
	async getReleaseQaFlags(@Param('id') id: string) {
		return this.ciService.getReleaseQaFlags(id);
	}
}
