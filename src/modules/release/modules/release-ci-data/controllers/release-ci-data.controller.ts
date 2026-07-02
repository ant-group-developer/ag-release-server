import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Res,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AppResponseSuccess } from 'src/app.const';
import { streamDownload } from 'src/utils/util';
import {
	BulkSyncDataCiDto,
	GetListReleaseCiDataDto,
	UpsertReleaseCiDataDto,
} from '../dto/release-ci-data.dto';
import { ReleaseCiDataService } from '../services/release-ci-data.service';

@ApiTags('Dữ liệu CI của bản phát hành')
@Controller('release-ci-data')
export class ReleaseCiDataController {
	constructor(private readonly service: ReleaseCiDataService) {}

	@Get()
	@ApiOperation({
		summary: 'Lấy danh sách dữ liệu CI của bản phát hành',
	})
	@ApiQuery({
		type: GetListReleaseCiDataDto,
		description: 'Bộ lọc danh sách dữ liệu CI của bản phát hành',
	})
	async getList(@Query() query: GetListReleaseCiDataDto) {
		const result = await this.service.getList(query);
		return AppResponseSuccess.COMMON(result);
	}

	@Post('export')
	@ApiOperation({
		summary: 'Export danh sách dữ liệu CI ra Excel',
	})
	@ApiBody({
		type: GetListReleaseCiDataDto,
		description: 'Bộ lọc danh sách dữ liệu CI cần export',
	})
	async exportData(
		@Body() body: GetListReleaseCiDataDto,
		@Res() res: Response,
	) {
		const file = await this.service.exportData(body);
		return streamDownload(res, file);
	}

	@Post('create-missing')
	@ApiOperation({
		summary: 'Tự động tạo các bản ghi từ release',
	})
	async createMissingForNonImportedNonDraftReleases() {
		const result =
			await this.service.createMissingForNonImportedNonDraftReleases();
		return AppResponseSuccess.COMMON(result);
	}

	@Post('bulk-sync-data-ci')
	@ApiOperation({
		summary: 'Bulk sync data CI',
	})
	@ApiBody({
		type: BulkSyncDataCiDto,
		required: false,
		description:
			'Không truyền body: đồng bộ tất cả. Truyền latestSyncedAt = null: chỉ đồng bộ các bản ghi chưa từng đồng bộ.',
	})
	bulkSyncDataCi(@Body() body: BulkSyncDataCiDto) {
		this.service.bulkSyncDataCi(body).catch((error) => {
			console.log(
				`Error in bulkSyncDataCi: ${error.message}`,
				error.stack,
			);
		});
		return AppResponseSuccess.JOB_PROCESSING();
	}

	@Get(':id')
	@ApiOperation({
		summary: 'Lấy chi tiết dữ liệu CI',
	})
	@ApiParam({
		name: 'id',
		format: 'uuid',
		description: 'ID dữ liệu CI',
	})
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.service.findOne(id);
		return AppResponseSuccess.COMMON(result);
	}

	@Get('release/:releaseId')
	@ApiOperation({
		summary: 'Lấy dữ liệu CI theo ID bản phát hành',
	})
	@ApiParam({
		name: 'releaseId',
		format: 'uuid',
		description: 'ID bản phát hành',
	})
	async findByReleaseId(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
	) {
		const result = await this.service.findByReleaseId(releaseId);
		return AppResponseSuccess.COMMON(result);
	}

	@Put('release/:releaseId')
	@ApiOperation({
		summary: 'Tạo mới hoặc cập nhật dữ liệu CI theo ID bản phát hành',
	})
	@ApiParam({
		name: 'releaseId',
		format: 'uuid',
		description: 'ID bản phát hành',
	})
	async upsertByReleaseId(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() body: UpsertReleaseCiDataDto,
	) {
		const result = await this.service.upsertByReleaseId(releaseId, body);
		return AppResponseSuccess.COMMON(result);
	}

	@Post('release/:releaseId/sync-ci')
	@ApiOperation({
		summary: 'Tự động đồng bộ dữ liệu CI theo ID bản phát hành',
	})
	@ApiParam({
		name: 'releaseId',
		format: 'uuid',
		description: 'ID bản phát hành',
	})
	async syncCiDataByReleaseId(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
	) {
		const result = await this.service.syncCiDataByReleaseId(releaseId);
		return AppResponseSuccess.COMMON(result);
	}
}
