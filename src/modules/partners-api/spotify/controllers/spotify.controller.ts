import { Body, Controller, Delete, Get, Param, Post, Put, Query, Logger, Sse, MessageEvent, NotFoundException, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SpotifyService } from '../services/spotify.service';
import { SpotifyService2 } from '../services/spotify2.service';
import { MetadataEnrichmentService } from '../services/metadata-enrichment.service';
import { MetadataScanService } from '../services/metadata-scan.service';
import { MetadataScanScheduleService } from '../services/metadata-scan-schedule.service';
import { EnrichEventsGateway } from '../services/enrich-events.gateway';
import { Observable, from, of, concat, merge, interval } from 'rxjs';
import { map, takeWhile, switchMap } from 'rxjs/operators';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	CreateMetadataScanScheduleDto,
	QueryMetadataScanSessionsDto,
	UpdateMetadataScanScheduleDto,
} from '../dtos/metadata-scan-schedule.dto';

@ApiTags('Partners API')
@ApiBearerAuth('token')
@Controller('partners')
export class SpotifyController {
	private readonly logger = new Logger(SpotifyController.name);

	constructor(
		private readonly spotifyService: SpotifyService,
		private readonly spotifyService2: SpotifyService2,
		private readonly metadataEnrichmentService: MetadataEnrichmentService,
		private readonly metadataScanService: MetadataScanService,
		private readonly metadataScanScheduleService: MetadataScanScheduleService,
		private readonly enrichEvents: EnrichEventsGateway,
	) {}

	@Post('spotify/token')
	async getToken(@Body() body: { clientId?: string; clientSecret?: string }) {
		const data = await this.spotifyService.getToken(body?.clientId, body?.clientSecret);
		return new ResponseSuccess({ data });
	}

	@Get('spotify/artists/:id')
	async getArtistDetail(@Param('id') id: string) {
		const data = await this.spotifyService2.getArtistDetail(id);
		return new ResponseSuccess({ data });
	}

	// ─── ENRICHMENT ENDPOINTS ────────────────────────────

	@Get('enrich/isrc/:isrc')
	@ApiOperation({ summary: 'Look up a single ISRC via Spotify/Deezer and return enriched metadata' })
	async enrichByIsrc(@Param('isrc') isrc: string) {
		const result = await this.metadataEnrichmentService.enrichByIsrc(isrc);
		return new ResponseSuccess({
			data: {
				isrc,
				found: !!result,
				data: result,
			},
		});
	}

	@Post('enrich/scan')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Scan report-imported releases and enrich metadata via Spotify/Deezer',
		description:
			'Scans releases with placeholder UPCs (ISRC-xxx) or missing metadata. ' +
			'Enriches with real data from Spotify/Deezer APIs. ' +
			'Every change is logged to ClickHouse `metadata_enrichment_log`. ' +
			'If limit is not provided, runs for ALL releases in background.',
	})
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max releases to process (omit to run ALL in background)' })
	@ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force re-scan already enriched releases' })
	@ApiQuery({ name: 'isImportedFromReport', required: false, type: Boolean, description: 'true: full report-import enrichment, false: links only' })
	async scanAndEnrich(
		@Query('limit') limit?: string,
		@Query('force') force?: string,
		@Query('isImportedFromReport') isImportedFromReport?: string,
	) {
		const parsedLimit = limit ? parseInt(limit, 10) : undefined;
		const isForce = force === 'true';
		const parsedIsImportedFromReport =
			this.parseOptionalBoolean(isImportedFromReport) ?? true;
		const scanId = uuidv4();

		// Always run the scan asynchronously in the background
		this.metadataScanService
			.scanAndEnrichAll({
				limit: parsedLimit,
				scanId,
				force: isForce,
				isImportedFromReport: parsedIsImportedFromReport,
			})
			.catch((err) => {
				this.logger.error(`Background scan failed: ${err.message}`, err.stack);
			});

		const summary = await this.metadataScanService.getEnrichmentSummary();
		return new ResponseSuccess({
			data: {
				message: 'Scan started in the background',
				scanId,
				force: isForce,
				limit: parsedLimit,
				isImportedFromReport: parsedIsImportedFromReport,
				summary,
			},
		});
	}

	@Get('enrich/scan/schedules')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Get metadata scan schedules' })
	async listScanSchedules() {
		const items = await this.metadataScanScheduleService.list();
		return new ResponseSuccess({ data: { items } });
	}

	@Post('enrich/scan/schedules')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Create metadata scan schedule' })
	async createScanSchedule(@Body() body: CreateMetadataScanScheduleDto) {
		const schedule = await this.metadataScanScheduleService.create(body);
		return new ResponseSuccess({ data: schedule });
	}

	@Put('enrich/scan/schedules/:id')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Update metadata scan schedule' })
	async updateScanSchedule(
		@Param('id') id: string,
		@Body() body: UpdateMetadataScanScheduleDto,
	) {
		const schedule = await this.metadataScanScheduleService.update(id, body);
		return new ResponseSuccess({ data: schedule });
	}

	@Delete('enrich/scan/schedules/:id')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Delete metadata scan schedule' })
	async deleteScanSchedule(@Param('id') id: string) {
		await this.metadataScanScheduleService.remove(id);
		return new ResponseSuccess({ data: { deleted: true } });
	}

	@Post('enrich/scan/schedules/:id/run-now')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Run metadata scan schedule now' })
	async runScanScheduleNow(@Param('id') id: string) {
		const result = await this.metadataScanScheduleService.runNow(id);
		return new ResponseSuccess({ data: result });
	}

	@Post('enrich/scan/:scanId/cancel')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Cancel a specific metadata scan session' })
	async cancelScanSession(@Param('scanId') scanId: string) {
		const result = await this.metadataScanService.cancelScanSession(scanId);
		return new ResponseSuccess({ data: result });
	}

	@Post('enrich/scan/cancel-all')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Cancel all active metadata scan sessions' })
	async cancelAllScanSessions() {
		const result = await this.metadataScanService.cancelAllScanSessions();
		return new ResponseSuccess({ data: result });
	}

	@Get('enrich/history')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Query enrichment change history from ClickHouse',
		description: 'View all changes logged during enrichment scans.',
	})
	@ApiQuery({ name: 'scanId', required: false, type: String, description: 'Filter by scan ID' })
	@ApiQuery({ name: 'isrc', required: false, type: String, description: 'Filter by ISRC' })
	@ApiQuery({ name: 'releaseId', required: false, type: String, description: 'Filter by release ID' })
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Page index (default 1)' })
	@ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Page size (default 100)' })
	async getChangeHistory(
		@Query('scanId') scanId?: string,
		@Query('isrc') isrc?: string,
		@Query('releaseId') releaseId?: string,
		@Query('page') page?: string,
		@Query('pageSize') pageSize?: string,
	) {
		const parsedPage = page ? parseInt(page, 10) : 1;
		const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 100;

		const [historyResult, summary, session] = await Promise.all([
			this.metadataScanService.getChangeHistory({
				scanId,
				isrc,
				releaseId,
				page: parsedPage,
				pageSize: parsedPageSize,
			}),
			this.metadataScanService.getEnrichmentSummary(),
			scanId ? this.metadataScanService.findScanSessionById(scanId) : Promise.resolve(null),
		]);

		let sessionInfo = null;
		if (session) {
			const startedAt = session.startedAt ? new Date(session.startedAt) : null;
			const finishedAt = session.finishedAt ? new Date(session.finishedAt) : null;
			let durationMs = null;
			let duration = null;

			if (startedAt) {
				const end = finishedAt || new Date();
				durationMs = end.getTime() - startedAt.getTime();
				
				if (durationMs < 1000) {
					duration = `${durationMs}ms`;
				} else {
					const totalSec = Math.floor(durationMs / 1000);
					const min = Math.floor(totalSec / 60);
					const sec = totalSec % 60;
					duration = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
				}
			}

			sessionInfo = {
				startedAt,
				finishedAt,
				durationMs,
				duration,
				status: session.status,
			};
		}

		return new ResponseSuccess({
			data: {
				summary,
				session: sessionInfo,
				items: historyResult.items,
				metadata: {
					page: parsedPage,
					pageSize: parsedPageSize,
					totalItems: historyResult.totalItems,
				},
			},
		});
	}

	@Get('enrich/scan/sessions')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Get list of metadata scan sessions (scan execution history)',
		description: 'Returns paged history of scan runs with their stats and status.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Page index' })
	@ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Page size' })
	@ApiQuery({ name: 'scheduleId', required: false, type: String, description: 'Filter by scan schedule ID' })
	@ApiQuery({ name: 'triggerType', required: false, type: String, description: 'MANUAL or CRON' })
	@ApiQuery({ name: 'isImportedFromReport', required: false, type: Boolean, description: 'Filter by data source' })
	@ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by scan status' })
	async getScanSessions(
		@Query() query: QueryMetadataScanSessionsDto,
	) {
		const parsedPage = query.page ? Number(query.page) : 1;
		const parsedPageSize = query.pageSize ? Number(query.pageSize) : 10;

		const result = await this.metadataScanService.listScanSessions({
			page: parsedPage,
			pageSize: parsedPageSize,
			scheduleId: query.scheduleId,
			triggerType: query.triggerType,
			isImportedFromReport: this.parseOptionalBoolean(
				query.isImportedFromReport as unknown as string,
			),
			status: query.status,
		});

		return new ResponseSuccess({
			data: new PageDto({
				items: result.items,
				metadata: {
					page: parsedPage,
					pageSize: parsedPageSize,
					totalItems: result.totalItems,
				},
			}),
		});
	}

	@Sse('enrich/scan/:scanId/events')
	@SystemAdminOnly()
	@Header('Cache-Control', 'no-cache, no-transform')
	@Header('Connection', 'keep-alive')
	@Header('X-Accel-Buffering', 'no')
	@ApiOperation({
		summary: 'Stream scan progress/status via Server-Sent Events',
		description: 'Auto-closes on completed or failed status. Use Authorization: Bearer <accessToken>.',
	})
	streamScanEvents(@Param('scanId') scanId: string): Observable<MessageEvent> {
		const updates$ = this.enrichEvents.subscribe(scanId).pipe(
			map((evt) => ({
				type: evt.type,
				data: evt.data,
			} as MessageEvent)),
		);

		const heartbeat$ = interval(20000).pipe(
			map(() => ({
				type: 'heartbeat',
				data: {},
			} as MessageEvent)),
		);

		const initial$ = from(this.metadataScanService.findScanSessionById(scanId)).pipe(
			switchMap((session) => {
				if (!session) {
					throw new NotFoundException(`Scan session not found: ${scanId}`);
				}

				const snapshotEvt: MessageEvent = {
					type: 'snapshot',
					data: {
						status: session.status,
						totalReleases: session.totalReleases,
						processedReleases: session.processedReleases,
						successCount: session.successCount,
						failedCount: session.failedCount,
						notFoundCount: session.notFoundCount,
						errorMessage: session.errorMessage,
					},
				};

				if (
					session.status === 'COMPLETED' ||
					session.status === 'FAILED' ||
					session.status === 'CANCELLED'
				) {
					return of(snapshotEvt);
				}

				return concat(of(snapshotEvt), updates$);
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

	private parseOptionalBoolean(value?: string | boolean): boolean | undefined {
		if (value === undefined) return undefined;
		if (value === true || value === 'true') return true;
		if (value === false || value === 'false') return false;
		return undefined;
	}
}
