import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
// import { ReleaseSubmitService } from './services/release-submit.service';
import { QueryGetListSubmitDto } from '../dto/release-submit.dto';
import { ExecutionType } from '../entities/release-submit.entity';
import { ReleaseSubmitService2 } from '../services/release-submit2.service';

@ApiTags('Release Submits')
@Controller('release-submits')
// @Controller('release-submits-disable')
export class ReleaseSubmitController {
	constructor(private readonly releaseSubmitService: ReleaseSubmitService2) { }

	/** User bấm submit release */
	@Post()
	async submit(@Body() body: { releaseId: string; dspCodes: string[] }) {
		const result = await this.releaseSubmitService.submit({
			releaseId: body.releaseId,
			dspCodes: body.dspCodes,
			type: ExecutionType.INITIAL_RELEASE,
		});
		return new ResponseSuccess({ data: result });
	}

	/** Lấy danh sách submits */
	@Get()
	async getList(@Query() query: QueryGetListSubmitDto) {
		const result = await this.releaseSubmitService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết submit + steps */
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseSubmitService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	// /** Xem steps đang chờ CRON resume của 1 submit cụ thể */
	// @Get(':id/steps/waiting')
	// async getWaitingStepsBySubmit(@Param('id', ParseUUIDPipe) id: string) {
	// 	const result = await this.releaseSubmitService.getWaitingStepsBySubmitId(id);
	// 	return new ResponseSuccess({ data: result });
	// }

	// /** Retry 1 step bị failed */
	@Post('steps/:stepId/retry')
	async retryStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
		const result = await this.releaseSubmitService.retryStep(stepId);
		return new ResponseSuccess({ data: result });
	}

	// /** Admin hoàn thành step WAITING_ACTION → resume execution */
	// @Post('steps/:stepId/resume')
	// async resumeFromWaiting(@Param('stepId', ParseUUIDPipe) stepId: string) {
	// 	const result =
	// 		await this.releaseSubmitService.resumeFromWaiting(stepId);
	// 	return new ResponseSuccess({ data: result });
	// }

	// /** Sync release status từ submit status mới nhất */
	// @Post('sync-release-status/:releaseId')
	// async syncReleaseStatus(
	// 	@Param('releaseId', ParseUUIDPipe) releaseId: string,
	// ) {
	// 	const result =
	// 		await this.releaseSubmitService.syncReleaseStatus(releaseId);
	// 	return new ResponseSuccess({ data: { releaseId, newStatus: result } });
	// }

	// /** Xem các steps đang chờ CRON resume */
	// @Get('steps/waiting')
	// async getWaitingSteps(@Query('releaseId') releaseId?: string) {
	// 	const result = await this.releaseSubmitService.getWaitingSteps(releaseId);
	// 	return new ResponseSuccess({ data: result });
	// }
}
