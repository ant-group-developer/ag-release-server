// controllers/release-execution3.controller.ts

import {
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { QueryGetListReleaseExecution3Dto } from '../dtos/release-execution3.dto';
import { ReleaseExecution3Service } from '../services/release-execution3.service';

@ApiTags('Release Executions 3')
// @Controller('release-executions3')
@Controller('release-submits')
export class ReleaseExecution3Controller {
	constructor(
		private readonly releaseExecution3Service: ReleaseExecution3Service,
	) {}

	@Get('sync-output/:id')
	async syncExecutionOutputToReleaseDeliveryDsp(
		@Param('id', ParseUUIDPipe) id: string,
	) {
		await this.releaseExecution3Service.syncExecutionOutputToReleaseDeliveryDsp(
			id,
		);

		return new ResponseSuccess({ data: true });
	}

	@Get()
	async getList(@Query() query: QueryGetListReleaseExecution3Dto) {
		const result = await this.releaseExecution3Service.getList(query);

		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseExecution3Service.findOne(id);

		return new ResponseSuccess({ data: result });
	}

	@Post('steps/:stepId/retry')
	async retryStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
		const result = await this.releaseExecution3Service.retryStep(stepId);
		return new ResponseSuccess({ data: result });
	}

	// @Post('steps/:stepId/run')
	// async runStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
	// 	const result = await this.releaseExecution3Service.runStep(stepId);

	// 	return new ResponseSuccess({ data: result });
	// }
}
