import {
	Body,
	Controller,
	Delete,
	Get,
	Header,
	Logger,
	MessageEvent,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable, concat, from, interval, merge, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	CreateSonarScheduleDto,
	UpdateSonarScheduleDto,
} from '../dtos/spotify-sonar-schedule.dto';
import { SpotifySonarScheduleService } from '../services/spotify-sonar-schedule.service';
import { SpotifyProviderScanService } from '../services/spotify-provider-scan.service';
import { SonarEventsGateway } from '../services/sonar-events.gateway';

@ApiTags('Partners API')
@ApiBearerAuth('token')
@Controller('partners/spotify-sonar')
export class SpotifySonarController {
	private readonly logger = new Logger(SpotifySonarController.name);

	constructor(
		private readonly scanService: SpotifyProviderScanService,
		private readonly scheduleService: SpotifySonarScheduleService,
		private readonly sonarEvents: SonarEventsGateway,
	) {}

	@Get('releases/:releaseId/deliveries')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Lấy danh sách Sonar deliveries của 1 release',
		description: 'Trả về tất cả delivery records từ Spotify Sonar (API 1+2), sort theo created_at_spotify DESC',
	})
	async getDeliveriesByRelease(@Param('releaseId') releaseId: string) {
		const items = await this.scanService.getDeliveriesByRelease(releaseId);
		return new ResponseSuccess({ data: { items, total: items.length } });
	}

	@Post('scan/trigger')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Trigger Spotify Sonar delivery + catalog scan manually' })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiQuery({ name: 'force', required: false, type: Boolean })
	@ApiQuery({ name: 'isImportedFromReport', required: false, type: Boolean })
	async triggerScan(
		@Query('limit') limit?: string,
		@Query('force') force?: string,
		@Query('isImportedFromReport') isImportedFromReport?: string,
	) {
		const parsedLimit = limit ? parseInt(limit, 10) : undefined;
		const isForce = force === 'true';
		const parsedIsImportedFromReport = this.parseOptionalBoolean(isImportedFromReport);

		// Create session first so we can return scanId immediately
		const { scanId } = await this.scanService.createSession({
			force: isForce,
			limitCount: parsedLimit ?? null,
			isImportedFromReport: parsedIsImportedFromReport ?? null,
		});

		// Fire scan in background
		this.scanService
			.scanAll({ scanId, limit: parsedLimit, force: isForce, isImportedFromReport: parsedIsImportedFromReport })
			.catch((err: Error) => {
				this.logger.error(`Background Spotify Sonar scan failed: ${err.message}`, err.stack);
			});

		return new ResponseSuccess({
			data: {
				scanId,
				message: 'Spotify Sonar scan started in background',
				limit: parsedLimit,
				force: isForce,
				isImportedFromReport: parsedIsImportedFromReport,
			},
		});
	}

	@Sse('scan/:scanId/events')
	@SystemAdminOnly()
	@Header('Cache-Control', 'no-cache, no-transform')
	@Header('Connection', 'keep-alive')
	@Header('X-Accel-Buffering', 'no')
	@ApiOperation({ summary: 'SSE stream tiến độ Sonar scan theo scanId' })
	streamScanEvents(@Param('scanId') scanId: string): Observable<MessageEvent> {
		const updates$ = this.sonarEvents.subscribe(scanId).pipe(
			map((evt) => ({ type: evt.type, data: evt.data } as MessageEvent)),
		);

		const heartbeat$ = interval(20000).pipe(
			map(() => ({ type: 'heartbeat', data: {} } as MessageEvent)),
		);

		const initial$ = from(this.scanService.findSessionById(scanId)).pipe(
			switchMap((session) => {
				if (!session) {
					throw new NotFoundException(`Sonar scan session not found: ${scanId}`);
				}

				const snapshot: MessageEvent = {
					type: 'snapshot',
					data: {
						scanId: session.id,
						status: session.status,
						totalReleases: session.totalReleases,
						processedReleases: session.processedReleases,
						successCount: session.successCount,
						failedCount: session.failedCount,
						force: session.force,
						triggerType: session.triggerType,
						limitCount: session.limitCount,
						isImportedFromReport: session.isImportedFromReport,
						startedAt: session.startedAt,
						finishedAt: session.finishedAt,
						errorMessage: session.errorMessage,
					},
				};

				if (['COMPLETED', 'FAILED'].includes(session.status)) {
					return of(snapshot);
				}

				return concat(of(snapshot), updates$);
			}),
		);

		return merge(initial$, heartbeat$).pipe(
			takeWhile(
				(evt: MessageEvent) => evt.type !== 'completed' && evt.type !== 'failed',
				true,
			),
		);
	}

	@Get('scan/sessions')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Lấy danh sách các Sonar scan session gần đây' })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	async listSessions(@Query('limit') limit?: string) {
		const parsedLimit = limit ? parseInt(limit, 10) : 20;
		const sessions = await this.scanService.listSessions(parsedLimit);
		return new ResponseSuccess({ data: { items: sessions, total: sessions.length } });
	}

	@Get('scan/sessions/:scanId')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Chi tiết 1 Sonar scan session' })
	async getSession(@Param('scanId') scanId: string) {
		const session = await this.scanService.findSessionById(scanId);
		if (!session) throw new NotFoundException(`Scan session not found: ${scanId}`);
		return new ResponseSuccess({ data: session });
	}

	@Get('schedules')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'List Spotify Sonar scan schedules' })
	async listSchedules() {
		const items = await this.scheduleService.list();
		return new ResponseSuccess({ data: { items } });
	}

	@Post('schedules')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Create Spotify Sonar scan schedule' })
	async createSchedule(@Body() body: CreateSonarScheduleDto) {
		const schedule = await this.scheduleService.create(body);
		return new ResponseSuccess({ data: schedule });
	}

	@Put('schedules/:id')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Update Spotify Sonar scan schedule' })
	async updateSchedule(@Param('id') id: string, @Body() body: UpdateSonarScheduleDto) {
		const schedule = await this.scheduleService.update(id, body);
		return new ResponseSuccess({ data: schedule });
	}

	@Delete('schedules/:id')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Delete Spotify Sonar scan schedule' })
	async deleteSchedule(@Param('id') id: string) {
		await this.scheduleService.remove(id);
		return new ResponseSuccess({ data: { deleted: true } });
	}

	@Post('schedules/:id/run-now')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Run a Spotify Sonar scan schedule immediately' })
	async runScheduleNow(@Param('id') id: string) {
		const result = await this.scheduleService.runNow(id);
		return new ResponseSuccess({ data: result });
	}

	private parseOptionalBoolean(value?: string): boolean | undefined {
		if (value === undefined) return undefined;
		if (value === 'true') return true;
		if (value === 'false') return false;
		return undefined;
	}
}
