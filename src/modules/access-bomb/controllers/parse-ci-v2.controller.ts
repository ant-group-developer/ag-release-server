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

	// @PublicRoute()
	// @Get('release/:id')
	// findOne(@Param('id') id: number) {
	// 	return this.service.findOne(id);
	// }

	@PublicRoute()
	@Post('release-by-upc/:upc')
	parseReleaseByUpc(
		@Param('upc') upc: string,
		@Query('ciOrderId') ciOrderId: string,
	) {
		return this.service.parseReleaseByUpc(upc, ciOrderId);
	}

	@PublicRoute()
	@Post('release/:id')
	parseRelease(
		@Param('id') id: number,
		@Query('ciOrderId') ciOrderId: string,
	) {
		return this.service.parseRelease(id, ciOrderId);
	}

	@PublicRoute()
	@Post('release')
	bulkParseRelease(@Query('ciOrderId') ciOrderId: string) {
		return this.service.parseAllReleases(ciOrderId);
	}

	// test all

	@PublicRoute()
	@Get('track/:id')
	getTrackDetail(@Param('id') id: number) {
		return this.service.getTrackDetail(id);
	}

	@PublicRoute()
	@Get('release/:id')
	getReleaseDetail(@Param('id') id: number) {
		return this.service.getReleaseDetail(id);
	}

	@PublicRoute()
	@Get('select-values')
	async getSelectValues(@Query('column') column: string) {
		return this.service.getSelectOptionsFromMetadataTemplate(column);
	}
}
