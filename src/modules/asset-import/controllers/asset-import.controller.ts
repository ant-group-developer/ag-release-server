import {
	BadRequestException,
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
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
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
import { extname } from 'path';
import { ASSET_IMPORT_ALLOWED_EXTENSIONS } from '../constants/asset-import.constant';
import {
	ApplyAssetImportDto,
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

	@Post('scan')
	@UseInterceptors(FileInterceptor('file'))
	@ApiConsumes('multipart/form-data')
	@ApiOperation({
		summary: 'Upload file assets và quét đối chiếu với hệ thống',
		description:
			'Trả về toàn bộ số dòng trong file kèm diff từng cột. Chưa thay đổi dữ liệu — cần gọi apply để convert.',
	})
	@ApiBody({
		required: true,
		schema: {
			type: 'object',
			required: ['file', 'targetTenantId'],
			properties: {
				file: { type: 'string', format: 'binary' },
				targetTenantId: { type: 'string', format: 'uuid' },
				targetLabelId: { type: 'string' },
				options: {
					type: 'string',
					description:
						'JSON string, ví dụ {"updateOwnership":true,"createIfNotFound":false}',
				},
			},
		},
	})
	async scan(
		@UploadedFile()
		file: { originalname?: string; buffer: Buffer; size?: number },
		@Body() dto: ScanAssetImportDto,
		@Req() req: Request,
	) {
		if (!file) {
			throw new BadRequestException(
				'Thiếu file. Dùng multipart/form-data với key = file',
			);
		}

		const ext = extname(file.originalname ?? '').toLowerCase();
		if (!ASSET_IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
			throw new BadRequestException(
				`Chỉ chấp nhận file ${ASSET_IMPORT_ALLOWED_EXTENSIONS.join(', ')}`,
			);
		}

		const result = await this.assetImportService.scan(
			file,
			dto,
			req.user!.sub,
		);

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
			this.assetImportService.getBatchOrFail(batchId),
			this.queryService.getBatchSummary(batchId),
		]);

		return new ResponseSuccess({ data: { ...batch, summary } });
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
		description: 'Batch đã apply item nào thì không huỷ được, để giữ lịch sử.',
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

				const initial$ = from(this.importJobsService.findById(jobId)).pipe(
					switchMap((job) => {
						if (!job) {
							throw new NotFoundException(`Không tìm thấy job ${jobId}`);
						}
						return of<MessageEvent>({ type: 'snapshot', data: job });
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
