import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { AppResponseSuccess } from 'src/app.const';
import {
	QueryGetListReleaseExecution3Dto,
	RetryReleaseExecutionStepDto,
} from '../dtos/release-execution3.dto';
import { ReleaseExecution3Service } from '../services/release-execution3.service';

@ApiTags('Release Executions 3')
@Controller('release-executions3')
export class ReleaseExecution3Controller {
	constructor(
		private readonly releaseExecution3Service: ReleaseExecution3Service,
	) {}

	@Get('sync-output/:id')
	@ApiOperation({ summary: 'Sync execution output to release DSP delivery' })
	@ApiParam({ name: 'id', type: String })
	async syncExecutionOutputToReleaseDeliveryDsp(
		@Param('id', ParseUUIDPipe) id: string,
	) {
		await this.releaseExecution3Service.syncExecutionOutputToReleaseDeliveryDsp(
			id,
		);

		return new ResponseSuccess({ data: true });
	}

	@Get()
	@ApiOperation({ summary: 'Get release execution list' })
	async getList(@Query() query: QueryGetListReleaseExecution3Dto) {
		const result = await this.releaseExecution3Service.getList(query);

		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get release execution detail' })
	@ApiParam({ name: 'id', type: String })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseExecution3Service.findOne(id);

		return new ResponseSuccess({ data: result });
	}

	@Post('steps/:stepId/retry')
	@ApiOperation({ summary: 'Retry a release execution step' })
	@ApiParam({ name: 'stepId', type: String })
	async retryStep(
		@Param('stepId', ParseUUIDPipe) stepId: string,
		@Body() body: RetryReleaseExecutionStepDto,
	) {
		const result = await this.releaseExecution3Service.retryStep(
			stepId,
			body?.isOverrideStatus,
		);
		return new ResponseSuccess({ data: result });
	}

	@Post('auto-retry-sync-data-dsp-ci')
	@ApiOperation({
		summary:
			'Auto retry failed SYNC_DATA_DSP_CI steps in latest executions',
	})
	autoRetrySyncDataDspCi() {
		this.releaseExecution3Service
			.autoRetrySyncDataDspCiFailedSteps()
			.catch((err) => {
				console.error(
					'Error auto retry sync data DSP CI failed steps:',
					err,
				);
			});

		return AppResponseSuccess.JOB_PROCESSING();
	}

	// @Post('steps/:stepId/run')
	// async runStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
	// 	const result = await this.releaseExecution3Service.runStep(stepId);

	// 	return new ResponseSuccess({ data: result });
	// }
}
