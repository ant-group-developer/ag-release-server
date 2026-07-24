// controllers/release-execution3.controller.ts

import {
	Body,
	Controller,
	Get,
	Param,
	ParseArrayPipe,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { AppResponseSuccess } from 'src/app.const';
import {
	QueryGetListReleaseExecution3Dto,
	StepCleanupConfigItem,
	UpdateCleanupConfigDto,
} from '../dtos/release-execution3.dto';
import { ReleaseExecutionConfigService } from '../services/release-execution-config.service';
import { ReleaseExecution3Service } from '../services/release-execution3.service';

@ApiTags('Release Executions 3')
@Controller('release-executions3')
export class ReleaseExecution3Controller {
	constructor(
		private readonly releaseExecutionConfigService: ReleaseExecutionConfigService,
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

	@Post('cancel-old-executions')
	@ApiOperation({
		summary: 'Cancel executions older than a specified time (e.g., 3d)',
	})
	@ApiBody({ type: [StepCleanupConfigItem] })
	async cancelOldExecutions(
		@Body(new ParseArrayPipe({ items: StepCleanupConfigItem }))
		manualStepConfigs: StepCleanupConfigItem[],
	) {
		const result =
			await this.releaseExecution3Service.cancelOldExecutions(
				manualStepConfigs,
			);

		return new ResponseSuccess({ data: result });
	}

	@Get('get-cleanup-config')
	@ApiOperation({ summary: 'Get configuration for stuck steps cleanup' })
	getCleanupConfig() {
		const config = this.releaseExecutionConfigService.getCleanupConfig();
		return new ResponseSuccess({ data: config });
	}

	@Post('set-cleanup-config')
	@ApiOperation({ summary: 'Update configuration for stuck steps cleanup' })
	async updateCleanupConfig(@Body() body: UpdateCleanupConfigDto) {
		const result = await this.releaseExecutionConfigService.updateConfig(
			body.cleanupCronValue,
			body.stepConfigs,
		);

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
	async retryStep(@Param('stepId', ParseUUIDPipe) stepId: string) {
		const result = await this.releaseExecution3Service.retryStep(stepId);
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
