import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	ListExchangeRateDto,
	SyncExchangeRateDto,
} from '../dto/exchange-rate.dto';
import { ExchangeRateService } from '../services/exchange-rate/exchange-rate.service';

@ApiTags('ETL - Exchange Rates')
@Controller('etl/exchange-rates')
export class ExchangeRateController {
	constructor(private readonly exchangeRateService: ExchangeRateService) {}

	@Post('sync')
	@ApiOperation({
		summary: 'Sync exchange rates for a range of months',
		description:
			'Fetch EOM rates from Frankfurter v2 API for each month in [fromMonth..toMonth]. ' +
			'Skips months already synced. Ví dụ: fromMonth=2024-01, toMonth=2024-12.',
	})
	@ApiResponse({ status: 201, description: 'Sync completed.' })
	async syncRange(@Body() dto: SyncExchangeRateDto) {
		const result = await this.exchangeRateService.syncRange(
			dto.fromMonth,
			dto.toMonth,
		);
		return new ResponseSuccess({ data: result });
	}

	@Post('backfill')
	@ApiOperation({
		summary: 'Backfill exchange rates for all months in fact_sales_report',
		description:
			'Quét bảng fact_sales_report tìm tất cả tháng chưa có tỷ giá, ' +
			'tự động fetch từ Frankfurter API, sau đó rebuild cubes v2 với revenue USD chính xác.',
	})
	@ApiResponse({
		status: 201,
		description: 'Backfill and rebuild completed.',
	})
	async backfill() {
		const result = await this.exchangeRateService.backfillMissingRates();
		return new ResponseSuccess({ data: result });
	}

	@Post('rebuild-cubes')
	@ApiOperation({
		summary:
			'Rebuild sales cubes v2 from fact_sales_report + exchange_rates',
		description:
			'Truncate + re-populate sales_dsp_monthly_cube_v2 và sales_ter_monthly_cube_v2 ' +
			'bằng cách JOIN fact_sales_report với exchange_rates để tính revenue USD.',
	})
	@ApiResponse({ status: 201, description: 'Cubes rebuilt.' })
	async rebuildCubes() {
		const result = await this.exchangeRateService.rebuildCubes();
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({
		summary: 'List exchange rates stored in ClickHouse',
		description: 'Lọc theo month (YYYY-MM) và/hoặc currency code.',
	})
	@ApiResponse({ status: 200, description: 'Exchange rates list.' })
	async listRates(
		@Query() query: ListExchangeRateDto,
	): Promise<ResponseSuccess<any>> {
		const rates = await this.exchangeRateService.listRates({
			month: query.month,
			currency: query.currency,
		});
		return new ResponseSuccess({ data: rates });
	}
}
