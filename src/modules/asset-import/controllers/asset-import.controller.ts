import {
	Body,
	Controller,
	Delete,
	Get,
	MessageEvent,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { concat, from, interval, merge, Observable, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import {
	JobEvent,
	JobEventsGateway,
} from 'src/modules/etl/services/import-jobs/job-events.gateway';
import {
	ApplyAssetImportDto,
	PresignAssetImportDto,
	QueryAssetImportBatchDto,
	QueryAssetImportItemDto,
	ScanAssetImportDto,
} from '../dto/asset-import.dto';
import { AssetImportQueryService } from '../services/asset-import.query.service';
import { AssetImportService } from '../services/asset-import.service';

@ApiTags('Asset Import')
@SystemAdminOnly()
@Controller('asset-import')
export class AssetImportController {
	constructor(
		private readonly assetImportService: AssetImportService,
		private readonly queryService: AssetImportQueryService,
		private readonly importJobsService: ImportJobsService,
		private readonly jobEvents: JobEventsGateway,
	) {}

	@Get('template/download')
	@ApiOperation({
		summary: 'Tải template Excel cho Asset Import',
		description:
			'Trả presigned URL của file template trong protected R2 bucket. Client mở downloadUrl để tải file.',
	})
	@ApiResponse({
		status: 200,
		description: 'Presigned URL để tải asset-import-template.xlsx.',
	})
	async downloadTemplate() {
		return new ResponseSuccess({
			data: {
				downloadUrl:
					await this.assetImportService.getTemplateDownloadUrl(),
			},
		});
	}

	@Post('uploads/presign')
	@ApiOperation({
		summary: 'Cấp presigned URL để upload file assets thẳng lên R2',
		description:
			'FE PUT nội dung file vào uploadUrl trả về, rồi gọi POST /asset-import/scan với r2Key. ' +
			'File assets có thể rất nặng nên không đẩy qua body API.',
	})
	async presignUpload(@Body() dto: PresignAssetImportDto) {
		const result = await this.assetImportService.presignUpload(dto);
		return new ResponseSuccess({ data: result });
	}

	@Post('scan')
	@ApiOperation({
		summary: 'Quét đối chiếu file đã upload lên R2 với hệ thống',
		description:
			'Trả về toàn bộ số dòng trong file kèm diff từng cột. Chưa thay đổi dữ liệu — cần gọi apply để convert. ' +
			'Label lấy theo cột Label Name trong file; dòng không có label mà đổi workspace sẽ được auto-select label của workspace đích.',
	})
	async scan(@Body() dto: ScanAssetImportDto, @Req() req: Request) {
		const result = await this.assetImportService.scan(dto, req.user!.sub);

		return new ResponseSuccess({ data: result });
	}

	@Get('batches')
	@ApiOperation({ summary: 'Lịch sử các lần import assets' })
	@ApiResponse({ status: 200, description: 'Danh sách batch có phân trang' })
	async listBatches(@Query() query: QueryAssetImportBatchDto) {
		const result = await this.queryService.listBatches(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('batches/:batchId')
	@ApiOperation({ summary: 'Chi tiết một batch kèm thống kê' })
	@ApiParam({ name: 'batchId' })
	async getBatch(@Param('batchId', ParseUUIDPipe) batchId: string) {
		const [batch, summary] = await Promise.all([
			this.assetImportService.getBatchOrFail(batchId, true),
			this.queryService.getBatchSummary(batchId),
		]);

		return new ResponseSuccess({
			data: { ...this.queryService.toBatchView(batch), summary },
		});
	}

	@Get('batches/:batchId/items')
	@ApiOperation({
		summary: 'Danh sách dòng đã quét kèm diff chi tiết từng cột',
	})
	@ApiParam({ name: 'batchId' })
	async listItems(
		@Param('batchId', ParseUUIDPipe) batchId: string,
		@Query() query: QueryAssetImportItemDto,
	) {
		await this.assetImportService.getBatchOrFail(batchId);
		const result = await this.queryService.listItems(batchId, query);
		return new ResponseSuccess({ data: result });
	}

	@Post('batches/:batchId/apply')
	@ApiOperation({
		summary: 'Convert những dòng người dùng chọn',
		description:
			'Chạy nền. Theo dõi tiến độ qua GET /asset-import/batches/:batchId/events hoặc poll batch detail.',
	})
	@ApiParam({ name: 'batchId' })
	async apply(
		@Param('batchId', ParseUUIDPipe) batchId: string,
		@Body() dto: ApplyAssetImportDto,
		@Req() req: Request,
	) {
		const result = await this.assetImportService.apply(
			batchId,
			dto,
			req.user!.sub,
		);
		return new ResponseSuccess({ data: result });
	}

	@Delete('batches/:batchId')
	@ApiOperation({
		summary: 'Huỷ batch chưa apply',
		description:
			'Batch đã apply item nào thì không huỷ được, để giữ lịch sử.',
	})
	@ApiParam({ name: 'batchId' })
	async cancel(@Param('batchId', ParseUUIDPipe) batchId: string) {
		await this.assetImportService.cancel(batchId);
		return new ResponseSuccess({ data: { batchId, cancelled: true } });
	}

	@Sse('batches/:batchId/events')
	@ApiOperation({
		summary: 'Stream tiến độ scan/apply qua SSE',
		description: 'Tự đóng khi job kết thúc.',
	})
	@ApiParam({ name: 'batchId' })
	streamEvents(
		@Param('batchId', ParseUUIDPipe) batchId: string,
	): Observable<MessageEvent> {
		return from(this.assetImportService.getBatchOrFail(batchId)).pipe(
			switchMap((batch) => {
				const jobId = batch.applyJobId ?? batch.scanJobId;
				if (!jobId) {
					throw new NotFoundException(
						`Batch ${batchId} chưa có job nào để theo dõi`,
					);
				}

				const initial$ = from(
					this.importJobsService.findById(jobId),
				).pipe(
					switchMap((job) => {
						if (!job) {
							throw new NotFoundException(
								`Không tìm thấy job ${jobId}`,
							);
						}
						return of<MessageEvent>({
							type: 'snapshot',
							data: job,
						});
					}),
				);

				const updates$ = this.jobEvents.subscribe(jobId).pipe(
					map<JobEvent, MessageEvent>((evt) => ({
						type: evt.type,
						data: evt.data,
					})),
				);

				const heartbeat$ = interval(20000).pipe(
					map<number, MessageEvent>(() => ({
						type: 'heartbeat',
						data: {},
					})),
				);

				return concat(
					initial$,
					merge(updates$, heartbeat$).pipe(
						takeWhile(
							(evt) =>
								evt.type !== 'completed' &&
								evt.type !== 'failed' &&
								evt.type !== 'cancelled',
							true,
						),
					),
				);
			}),
		);
	}
}
