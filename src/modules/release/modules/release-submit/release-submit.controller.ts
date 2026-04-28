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
import { ReleaseSubmitService } from './services/release-submit.service';
import { QueryGetListSubmitDto } from './dto/release-submit.dto';

@ApiTags('Release Submits')
@Controller('release-submits')
export class ReleaseSubmitController {
	constructor(
		private readonly releaseSubmitService: ReleaseSubmitService,
	) {}

	/** User bấm submit release */
	@Post()
	async submit(@Body() body: { releaseId: string; dspCodes: string[] }) {
		const result = await this.releaseSubmitService.submit(
			body.releaseId,
			body.dspCodes,
		);
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

	/** Retry 1 step bị failed */
	@Post('steps/:stepId/retry')
	async retryStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
		const result = await this.releaseSubmitService.retryStep(stepId);
		return new ResponseSuccess({ data: result });
	}

	/** Admin hoàn thành step WAITING_ACTION → resume execution */
	@Post('steps/:stepId/resume')
	async resumeFromWaiting(@Param('stepId', ParseUUIDPipe) stepId: string) {
		const result =
			await this.releaseSubmitService.resumeFromWaiting(stepId);
		return new ResponseSuccess({ data: result });
	}
}
