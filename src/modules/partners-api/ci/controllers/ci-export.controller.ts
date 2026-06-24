import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { GetCiDeliverDesireDto } from '../dtos/ci.dto';
import { CiExportService } from '../services/ci-export.service';

@ApiTags('Partners - CI Exports')
@Controller('partners/ci/exports')
export class CiExportController {
	private readonly logger = new Logger(CiExportController.name);

	constructor(private readonly ciExportService: CiExportService) {}

	// @ApiOperation({ summary: 'Lấy danh sách exports theo GTIN (UPC)' })
	// @ApiQuery({ name: 'gtin', required: true, example: '850080651032' })
	// @Get()
	// async getExportsByGtin(@Query('gtin') gtin: string) {
	// 	const result = await this.ciExportService.getExportsByGtin(gtin);
	// 	return new ResponseSuccess({ data: result });
	// }

	@ApiOperation({ summary: 'Lấy danh sách deliver desire từ CI' })
	@ApiQuery({ name: 'page', required: false, example: 0 })
	@ApiQuery({ name: 'pageSize', required: false, example: 200 })
	@ApiQuery({
		name: 'release_id',
		required: false,
		example: '117997406930032',
	})
	@ApiQuery({ name: 'status', required: false, example: 'complete' })
	@ApiQuery({
		name: 'transfer_batch_status',
		required: false,
		example: 'transferred',
	})
	@Get('deliver-desire')
	async getDeliverDesire(@Query() query: GetCiDeliverDesireDto) {
		const result = await this.ciExportService.getDeliverDesire(query);
		return new ResponseSuccess({ data: result });
	}

	// @ApiOperation({
	// 	summary: 'Lấy deliver desire của tất cả exports theo GTIN',
	// })
	// @ApiQuery({ name: 'gtin', required: true, example: '850080651032' })
	// @Get('deliver-desire-by-gtin')
	// async deliverDesireByGtin(@Query('gtin') gtin: string) {
	// 	const result = await this.ciExportService.deliverDesireByGtin(gtin);
	// 	return new ResponseSuccess({ data: result });
	// }

	@ApiOperation({
		summary: 'Lấy trạng thái DSP từ CI theo release format ID',
	})
	@ApiParam({ name: 'releaseFormatId', example: '117997406930032' })
	@Get('status-dsps/:releaseFormatId')
	async getStatusDsps(@Param('releaseFormatId') releaseFormatId: string) {
		const result = await this.ciExportService.getStatusDsps({
			releaseFormatId,
		});
		return new ResponseSuccess({ data: result });
	}

	// @ApiOperation({ summary: 'Lấy deliver desire cho 1 export' })
	// @ApiParam({ name: 'exportId', example: '117740894290191' })
	// @Get(':exportId/deliver-desire')
	// async deliverDesire(@Param('exportId') exportId: string) {
	// 	const result = await this.ciExportService.deliverDesire(exportId);
	// 	return new ResponseSuccess({ data: result });
	// }
}
