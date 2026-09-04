import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	MessageEvent,
	NotFoundException,
	Param,
	Post,
	Query,
	Req,
	Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { concat, EMPTY, from, interval, merge, Observable, of } from 'rxjs';
import {
	catchError,
	distinctUntilChanged,
	filter,
	map,
	switchMap,
	takeWhile,
} from 'rxjs/operators';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { ImportJob, ImportJobSourceType } from 'src/modules/etl/interfaces';
import {
	computeProgressDetail,
	ImportJobsService,
} from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { JobEventsGateway } from 'src/modules/etl/services/import-jobs/job-events.gateway';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	AnalyticsReportExportDto,
	CancelAnalyticsReportExportJobsDto,
	QueryAnalyticsReportExportsDto,
} from '../dto/analytics-report-export.dto';
import {
	AnalyticsReportExportCancelAllResult,
	AnalyticsReportExportCancelListResult,
	AnalyticsReportExportCancelResult,
	AnalyticsReportExportJobResult,
} from '../interfaces/analytics-report-export.interface';
import { AnalyticsReportExportService } from '../services/analytics-report-export.service';

@ApiTags('Analytics')
@Controller('analytics/reports')
export class AnalyticsReportExportController {
	constructor(
		private readonly exportService: AnalyticsReportExportService,
		private readonly importJobsService: ImportJobsService,
		private readonly jobEvents: JobEventsGateway,
		private readonly tenantService: TenantService,
	) {}

	@Post('export')
	@ApiOperation({
		summary: 'Create analytics revenue report export job',
		description:
			'Creates an async export job and returns an SSE URL. XLSX is the default and contains Summary + Detail sheets. CSV returns Detail only.',
	})
	@ApiResponse({
		status: 201,
		description: 'Export job created successfully.',
	})
	async exportReport(
		@Req() req: Request,
		@Body() dto: AnalyticsReportExportDto,
	): Promise<ResponseSuccess<AnalyticsReportExportJobResult>> {
		const tenantId = req.user!.tenantId;

		// ── Validate & resolve tenantIds ────────────────────────────
		await this.validateAndResolveTenantIds(dto, tenantId);

		const data = await this.exportService.createExportJob(
			tenantId,
			req.user!.sub,
			dto,
		);
		return new ResponseSuccess({ data });
	}

	@Post('export/cancel-all')
	@ApiOperation({
		summary: 'Cancel all active analytics report export jobs',
		description:
			'Cancels QUEUED and PROCESSING analytics report export jobs. Normal tenants cancel only their own jobs; system tenant cancels all.',
	})
	@ApiResponse({
		status: 201,
		description: 'Active export jobs cancelled successfully.',
	})
	async cancelAllExportJobs(
		@Req() req: Request,
	): Promise<ResponseSuccess<AnalyticsReportExportCancelAllResult>> {
		const data = await this.exportService.cancelAllExportJobs(
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('export/cancel-list')
	@ApiOperation({
		summary: 'Cancel selected analytics report export jobs',
		description:
			'Cancels selected QUEUED and PROCESSING analytics report export jobs. Normal tenants cancel only their own jobs; system tenant can cancel any export job.',
	})
	@ApiResponse({
		status: 201,
		description:
			'Selected export jobs cancel request handled successfully.',
	})
	async cancelSelectedExportJobs(
		@Req() req: Request,
		@Body() dto: CancelAnalyticsReportExportJobsDto,
	): Promise<ResponseSuccess<AnalyticsReportExportCancelListResult>> {
		const data = await this.exportService.cancelExportJobs(
			dto.jobIds,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('export/:jobId/cancel')
	@ApiOperation({
		summary: 'Cancel one analytics report export job',
		description:
			'Cancels a QUEUED or PROCESSING analytics report export job. Terminal jobs are returned unchanged.',
	})
	@ApiParam({ name: 'jobId', description: 'Export job ID' })
	@ApiResponse({
		status: 201,
		description: 'Export job cancel request handled successfully.',
	})
	async cancelExportJob(
		@Req() req: Request,
		@Param('jobId') jobId: string,
	): Promise<ResponseSuccess<AnalyticsReportExportCancelResult>> {
		const data = await this.exportService.cancelExportJob(
			jobId,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Get('exports')
	@ApiOperation({
		summary: 'List analytics report export jobs',
		description:
			'Tenant-scoped listing for analytics exports. Normal tenants see only their own jobs; system tenant can filter by tenantId or see all. ' +
			'Analytics exports are excluded from GET /etl/jobs by default and live here.',
	})
	@ApiResponse({ status: 200, description: 'Paginated export jobs.' })
	async listExports(
		@Req() req: Request,
		@Query() query: QueryAnalyticsReportExportsDto,
	): Promise<ResponseSuccess<PageDto<ReturnType<typeof formatExportJob>>>> {
		const isSystem = checkIsSystemTenant(req.user!.tenantId);
		// Normal tenants: force own tenant; ignore any tenantId passed in query.
		const tenantId = isSystem ? query.tenantId : req.user!.tenantId;
		const result = await this.importJobsService.list({
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			status: query.status,
			tenantId,
			limit: query.pageSize,
			offset: (query.page - 1) * query.pageSize,
			fieldOrder: query.fieldOrder,
			orderBy: query.orderBy,
		});
		return new ResponseSuccess({
			data: new PageDto({
				items: result.items.map((job) => formatExportJob(job)),
				metadata: {
					page: query.page,
					pageSize: query.pageSize,
					totalItems: result.totalItems,
				},
			}),
		});
	}

	@Sse('export/:jobId/events')
	@ApiOperation({
		summary: 'Stream analytics report export progress via SSE',
		description:
			'Client listens here after POST /analytics/reports/export. Completed event contains result.downloadUrl for bucket download.',
	})
	streamExportEvents(
		@Req() req: Request,
		@Param('jobId') jobId: string,
	): Observable<MessageEvent> {
		const updates$ = this.jobEvents.subscribe(jobId).pipe(
			map((evt) => ({
				type: evt.type,
				data: evt.data,
			})),
		);

		// Poll fallback: lưới an toàn nếu một event pub/sub bị mất. Không có nó,
		// mất đúng event `completed` là client treo ở "preparing download" mãi.
		// Dedupe theo (status, progressCurrent, processedRows) để không spam client.
		const poll$ = interval(2000).pipe(
			switchMap(() =>
				from(this.importJobsService.findById(jobId)).pipe(
					catchError(() => EMPTY),
				),
			),
			filter((job): job is ImportJob => !!job),
			distinctUntilChanged(
				(a, b) =>
					a.status === b.status &&
					a.progressCurrent === b.progressCurrent &&
					a.processedRows === b.processedRows,
			),
			map((job) => ({
				type: mapStatusToEventType(job.status),
				data: formatExportJob(job),
			})),
		);

		const heartbeat$ = interval(20000).pipe(
			map(() => ({
				type: 'heartbeat',
				data: {},
			})),
		);

		const initial$ = from(
			this.importJobsService
				.findById(jobId)
				.then(
					(job) => job ?? this.importJobsService.getSnapshot(jobId),
				),
		).pipe(
			switchMap((job) => {
				this.assertReadableJob(job, req.user!.tenantId, jobId);

				const snapshotEvt: MessageEvent = {
					type: 'snapshot',
					data: formatExportJob(job!),
				};

				if (
					job!.status === 'COMPLETED' ||
					job!.status === 'FAILED' ||
					job!.status === 'CANCELLED'
				) {
					return of(snapshotEvt);
				}

				return concat(of(snapshotEvt), merge(updates$, poll$));
			}),
		);

		return merge(initial$, heartbeat$).pipe(
			takeWhile((evt) => {
				return (
					evt.type !== 'completed' &&
					evt.type !== 'failed' &&
					evt.type !== 'cancelled'
				);
			}, true),
		);
	}

	/**
	 * Validate quyền truy cập workspace:
	 * - tenantId và tenantIds là mutual exclusive (400 nếu truyền cả hai).
	 * - System tenant → cho phép chọn bất kỳ workspace.
	 * - Normal tenant → chỉ được chọn workspace hiện tại + descendant. Danh sách
	 *   hợp lệ luôn resolve từ token (currentTenantId), không từ dto.tenantId —
	 *   dto chỉ khai báo ý định, token mới là nguồn quyền hạn.
	 * - Nếu cả hai đều trống → normal tenant mặc định [currentTenantId]; system = all.
	 */
	private async validateAndResolveTenantIds(
		dto: AnalyticsReportExportDto,
		currentTenantId: string,
	): Promise<void> {
		if (dto.tenantId && dto.tenantIds?.length) {
			throw new BadRequestException(
				'tenantId and tenantIds are mutually exclusive. Use exactly one.',
			);
		}

		// System tenant → cho phép chọn bất kỳ, không cần validate
		if (checkIsSystemTenant(currentTenantId)) {
			return;
		}

		// Normal tenant → mọi workspace được yêu cầu phải nằm trong descendant tree
		const requested = dto.tenantIds?.length
			? dto.tenantIds
			: dto.tenantId
				? [dto.tenantId]
				: [];

		if (requested.length > 0) {
			const allowedIds =
				await this.tenantService.getDescendantIds(currentTenantId);
			const allowedSet = new Set(allowedIds);
			const forbidden = requested.filter((id) => !allowedSet.has(id));
			if (forbidden.length > 0) {
				throw new ForbiddenException(
					`You do not have access to workspace(s): ${forbidden.join(', ')}`,
				);
			}
			return;
		}

		// Không truyền gì → mặc định workspace hiện tại
		dto.tenantIds = [currentTenantId];
	}

	private assertReadableJob(
		job: ImportJob | null,
		tenantId: string,
		jobId: string,
	): void {
		if (!job) {
			throw new NotFoundException(`Export job not found: ${jobId}`);
		}
		if (!checkIsSystemTenant(tenantId) && job.tenantId !== tenantId) {
			throw new NotFoundException(`Export job not found: ${jobId}`);
		}
	}
}

/**
 * Map job status → SSE event type. Phải khớp với logic trong
 * ImportJobsService.persist() để `takeWhile` ở stream đóng connection đúng lúc.
 */
function mapStatusToEventType(status: string): string {
	switch (status) {
		case 'COMPLETED':
			return 'completed';
		case 'FAILED':
			return 'failed';
		case 'CANCELLED':
			return 'cancelled';
		default:
			return 'progress';
	}
}

function formatExportJob(job: ImportJob) {
	return {
		id: job.id,
		sourceType: job.sourceType,
		status: job.status,
		progress: {
			current:
				job.status === 'COMPLETED'
					? job.progressTotal
					: job.progressCurrent,
			total: job.progressTotal,
			label: job.status === 'COMPLETED' ? 'Done' : job.progressLabel,
			detail: computeProgressDetail(job),
		},
		rows: {
			total: job.totalRows,
			processed: job.processedRows,
			skipped: job.skippedRows,
			errors: job.errorRows,
		},
		file: job.fileName
			? {
					name: job.fileName,
					sizeBytes: job.fileSizeBytes,
					hash: job.fileHash || null,
				}
			: null,
		params: job.params,
		result: job.result,
		error: job.errorMessage || null,
		batchId: job.batchId || null,
		tenantId: job.tenantId || null,
		createdBy: job.createdBy || null,
		createdAt: job.createdAt,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		durationMs: job.durationMs,
	};
}
