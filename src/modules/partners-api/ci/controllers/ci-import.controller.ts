import { Controller, Get, Logger, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CiImportOrderBy, GetCiImportsDto } from '../dtos/ci-import.dto';
import { CiImportService } from '../services/ci-import.service';

@ApiTags('Partners - CI Imports')
@Controller('partners/ci/imports')
export class CiImportController {
	private readonly logger = new Logger(CiImportController.name);

	constructor(private readonly ciImportService: CiImportService) {}

	@ApiOperation({ summary: 'Lay danh sach import batches tu CI' })
	@ApiQuery({
		name: 'package_id',
		required: false,
		example: '850080651056',
	})
	@ApiQuery({
		name: 'external_identifier',
		required: false,
		example: '20260625133720761',
	})
	@ApiQuery({
		name: 'order_by',
		required: false,
		enum: CiImportOrderBy,
		example: CiImportOrderBy.MODIFY_TIME_DESC,
	})
	@ApiQuery({ name: 'page', required: false, example: 0 })
	@ApiQuery({ name: 'page_size', required: false, example: 999 })
	@ApiQuery({ name: 'total_count', required: false, example: true })
	@ApiQuery({
		name: 'timestamp_after',
		required: false,
		example: '2026-06-01T00:00:00Z',
	})
	@ApiQuery({
		name: 'timestamp_before',
		required: false,
		example: '2026-06-25T23:59:59Z',
	})
	@Get()
	async getImports(@Query() query: GetCiImportsDto) {
		const result = await this.ciImportService.getImports(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Lay danh sach import batches simple tu CI' })
	@ApiQuery({
		name: 'package_id',
		required: false,
		example: '850080651056',
	})
	@ApiQuery({
		name: 'external_identifier',
		required: false,
		example: '20260625133720761',
	})
	@ApiQuery({
		name: 'order_by',
		required: false,
		enum: CiImportOrderBy,
		example: CiImportOrderBy.MODIFY_TIME_DESC,
	})
	@ApiQuery({ name: 'page', required: false, example: 0 })
	@ApiQuery({ name: 'page_size', required: false, example: 999 })
	@ApiQuery({ name: 'total_count', required: false, example: true })
	@ApiQuery({
		name: 'timestamp_after',
		required: false,
		example: '2026-06-01T00:00:00Z',
	})
	@ApiQuery({
		name: 'timestamp_before',
		required: false,
		example: '2026-06-25T23:59:59Z',
	})
	@Get('simple')
	async getImportsSimple(@Query() query: GetCiImportsDto) {
		const result = await this.ciImportService.getImportsSimple(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Lay chi tiet import batch tu CI' })
	@ApiParam({ name: 'batchId', example: '117997406930032' })
	@Get(':batchId')
	async getImportDetail(@Param('batchId') batchId: string) {
		const result = await this.ciImportService.getImportDetail(batchId);
		return new ResponseSuccess({ data: result });
	}
}
