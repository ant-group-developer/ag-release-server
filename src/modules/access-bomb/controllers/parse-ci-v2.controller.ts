// controller
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicRoute } from '../../auth/decorators/auth.decorator';
import { ParseDataCiService } from '../services/parse-ci-v2.service';

@Controller('ci')
export class ParseDataCiController {
	constructor(private readonly service: ParseDataCiService) {}

	@PublicRoute()
	@Get('release')
	getRelease(
		@Query('releaseId') releaseId?: number,
		@Query('label') label?: string,
	) {
		return this.service.getRelease({ releaseId, label });
	}

	@PublicRoute()
	@Get('release/:id')
	findOne(@Param('id') id: number) {
		return this.service.findOne(id);
	}

	@PublicRoute()
	@Post('release/:id')
	parseRelease(@Param('id') id: number) {
		return this.service.parseRelease(id);
	}
}
