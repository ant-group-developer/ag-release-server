import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Put,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UpdateReleaseCiStatusSyncScheduleDto } from '../dto/release-ci-status-sync-schedule.dto';
import { ReleaseCiStatusSyncScheduleService } from '../services/release-ci-status-sync-schedule.service';

@ApiTags('Release CI Status Sync')
@Controller('release-ci-status-sync')
export class ReleaseCiStatusSyncScheduleController {
	private readonly logger = new Logger(
		ReleaseCiStatusSyncScheduleController.name,
	);

	constructor(
		private readonly scheduleService: ReleaseCiStatusSyncScheduleService,
	) {}

	@Get('schedule')
	@ApiOperation({
		summary: 'Lấy cấu hình cron đồng bộ trạng thái release từ CI',
	})
	@ApiNotFoundResponse({
		description: 'Chưa có cấu hình cron đồng bộ trạng thái release từ CI',
	})
	async getSchedule() {
		const schedule = await this.scheduleService.getConfig();
		return AppResponseSuccess.COMMON(schedule);
	}

	@Put('schedule')
	@ApiOperation({
		summary: 'Cập nhật cấu hình cron đồng bộ trạng thái release từ CI',
	})
	@ApiBadRequestResponse({
		description:
			'Cron expression, timezone, release statuses hoặc giới hạn xử lý không hợp lệ',
	})
	@ApiNotFoundResponse({
		description: 'Chưa có cấu hình cron đồng bộ trạng thái release từ CI',
	})
	async updateSchedule(@Body() dto: UpdateReleaseCiStatusSyncScheduleDto) {
		const schedule = await this.scheduleService.updateConfig(dto);
		return AppResponseSuccess.COMMON(schedule);
	}

	@Post('run-now')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Chạy đồng bộ trạng thái release từ CI ngay lập tức',
	})
	@ApiBadRequestResponse({
		description: 'Chức năng đồng bộ trạng thái đang bị tắt',
	})
	@ApiOkResponse({
		description:
			'Trả summary nếu chạy ngay, hoặc xác nhận restart requested nếu đang có lượt chạy',
	})
	@ApiNotFoundResponse({
		description: 'Chưa có cấu hình cron đồng bộ trạng thái release từ CI',
	})
	runNow() {
		void this.scheduleService.runNow().catch((err: Error) => {
			this.logger.error(
				`[CI_STATUS_SYNC] Manual background execution failed: ${err.message}`,
				err.stack,
			);
		});

		return new ResponseSuccess({
			message: 'Thành công, tiến trình đang đồng bộ',
		});
	}
}
