import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CiService } from '../services/ci.service';

@ApiTags('Partners - CI Exports')
@Controller('partners/ci/exports')
export class CiExportController {
	private readonly logger = new Logger(CiExportController.name);

	constructor(private readonly ciService: CiService) {}

	@ApiOperation({ summary: 'Lấy danh sách exports theo GTIN (UPC)' })
	@ApiQuery({ name: 'gtin', required: true, example: '850080651032' })
	@Get()
	async getExportsByGtin(@Query('gtin') gtin: string) {
		const result = await this.ciService.getExportsByGtin(gtin);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Lấy deliver desire cho 1 export' })
	@ApiParam({ name: 'exportId', example: '117740894290191' })
	@Get(':exportId/deliver-desire')
	async deliverDesire(@Param('exportId') exportId: string) {
		const result = await this.ciService.deliverDesire(exportId);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Lấy deliver desire của tất cả exports theo GTIN',
	})
	@ApiQuery({ name: 'gtin', required: true, example: '850080651032' })
	@Get('deliver-desire-by-gtin')
	async deliverDesireByGtin(@Query('gtin') gtin: string) {
		const result = await this.ciService.deliverDesireByGtin(gtin);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Lấy trạng thái DSP từ CI theo UPC' })
	@ApiParam({ name: 'upc', example: '850080651032' })
	@Get('status-dsps/:upc')
	async getStatusDsps(@Param('upc') upc: string) {
		const result = await this.ciService.getStatusDsps(upc);
		return new ResponseSuccess({ data: result });
	}
}
