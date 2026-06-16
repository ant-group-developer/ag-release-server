import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import {
	GetCiQaFlagsDto,
	GetCiReleaseFormatsDto,
	GetCiReleasesDto,
} from '../dtos/ci.dto';
import { CiReleaseService } from '../services/ci-release.service';
import { CiService } from '../services/ci.service';

@Controller('partners/ci/releases')
export class CiReleaseController {
	private readonly logger = new Logger(CiReleaseController.name);

	constructor(
		private readonly ciService: CiService,
		private readonly ciReleaseService: CiReleaseService,
	) {}

	@Get()
	async getReleases(@Query() query: GetCiReleasesDto) {
		return this.ciService.getReleases(query);
	}

	@Get('releaseformats')
	async getReleaseFormats(@Query() query: GetCiReleaseFormatsDto) {
		return this.ciReleaseService.getReleaseFormats(query);
	}

	@Get('releaseformats/one')
	async getReleaseFormatOne(@Query() query: GetCiReleaseFormatsDto) {
		return this.ciReleaseService.getReleaseFormatOne(query);
	}

	@Get('releaseformats/:releaseFormatsId/qaflags')
	async getQaFlags(
		@Param('releaseFormatsId') releaseFormatsId: string,
		@Query() query: Omit<GetCiQaFlagsDto, 'releaseFormatsId'>,
	) {
		return this.ciReleaseService.getQaFlags({
			...query,
			releaseFormatsId,
		});
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
