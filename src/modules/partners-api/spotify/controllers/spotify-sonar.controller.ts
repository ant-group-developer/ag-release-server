import {
	Body,
	Controller,
	Delete,
	Get,
	Logger,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	CreateSonarScheduleDto,
	UpdateSonarScheduleDto,
} from '../dtos/spotify-sonar-schedule.dto';
import { SpotifySonarScheduleService } from '../services/spotify-sonar-schedule.service';
import { SpotifyProviderScanService } from '../services/spotify-provider-scan.service';

@ApiTags('Partners API')
@ApiBearerAuth('token')
@Controller('partners/spotify-sonar')
export class SpotifySonarController {
	private readonly logger = new Logger(SpotifySonarController.name);

	constructor(
		private readonly scanService: SpotifyProviderScanService,
		private readonly scheduleService: SpotifySonarScheduleService,
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

		this.scanService
			.scanAll({
				limit: parsedLimit,
				force: isForce,
				isImportedFromReport: parsedIsImportedFromReport,
			})
			.catch((err: Error) => {
				this.logger.error(`Background Spotify Sonar scan failed: ${err.message}`, err.stack);
			});

		return new ResponseSuccess({
			data: {
				message: 'Spotify Sonar scan started in background',
				limit: parsedLimit,
				force: isForce,
				isImportedFromReport: parsedIsImportedFromReport,
			},
		});
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
