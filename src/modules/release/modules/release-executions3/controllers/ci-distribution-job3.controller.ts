import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Res,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import {
	BatchActionCiJob3Dto,
	QueryGetListCiJob3Dto,
	QueryGroupedCiJob3Dto,
	UpdateCiJob3Dto,
} from '../dtos/ci-distribution-job3.dto';
import { CiDistributionJob3Service } from '../services/ci-distribution-job3.service';

@ApiTags('CI Distribution Jobs V3')
// @Controller('ci-distribution-jobs3')
@Controller('ci-distribution-jobs')
export class CiDistributionJob3Controller {
	constructor(private readonly jobService: CiDistributionJob3Service) {}

	@ApiOperation({ summary: 'Danh sách CI distribution jobs v3' })
	@ApiQuery({ type: QueryGetListCiJob3Dto })
	@Get()
	async getList(@Query() query: QueryGetListCiJob3Dto) {
		const result = await this.jobService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Danh sách grouped CI distribution jobs v3' })
	@Get('grouped')
	async getGrouped(@Query() query: QueryGroupedCiJob3Dto) {
		const result = await this.jobService.getGrouped(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Chi tiết CI distribution job v3' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.jobService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	// @ApiBody({ type: BatchActionCiJob3Dto })
	// @Post('auto-send-email')
	// async autoSendEmail(@Body() body: BatchActionCiJob3Dto) {
	// 	const result = await this.jobService.sendEmailToState51(body.ids);
	// 	return new ResponseSuccess({ data: result });
	// }

	@Post('daily-send')
	async handleDailySend() {
		await this.jobService.handleDailySend();
		return { message: 'Daily send executed' };
	}

	@ApiOperation({
		summary: 'Process CI jobs by type and send them to their destination',
	})
	@ApiBody({ type: BatchActionCiJob3Dto })
	@Post('process')
	async processJobs(@Body() body: BatchActionCiJob3Dto) {
		const result = await this.jobService.processJobs(body.ids);
		return new ResponseSuccess({ data: result });
	}

	@ApiBody({ type: BatchActionCiJob3Dto })
	@Post('download-excel')
	async downloadExcel(
		@Body() body: BatchActionCiJob3Dto,
		@Res() res: Response,
	) {
		const { buffer, fileName } = await this.jobService.exportFileExcel(
			body.ids,
		);

		res.set({
			'Content-Type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${fileName}"`,
			'Content-Length': buffer.length,
		});

		res.end(buffer);
	}

	// @ApiBody({ type: ConfirmCompletedCiJob3Dto })
	// @Post('confirm-completed')
	// async confirmCompleted(@Body() body: ConfirmCompletedCiJob3Dto) {
	// 	const result = await this.jobService.confirmCompleted(
	// 		body.ids,
	// 		body.exportIdFromCi,
	// 	);

	// 	return new ResponseSuccess({ data: result });
	// }

	// @ApiParam({ name: 'id', format: 'uuid' })
	// @Post(':id/cancel')
	// async cancelJob(@Param('id', ParseUUIDPipe) id: string) {
	// 	const result = await this.jobService.cancelJob(id);
	// 	return new ResponseSuccess({ data: result });
	// }

	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateCiJob3Dto })
	@Put(':id')
	async updateJob(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: UpdateCiJob3Dto,
	) {
		const result = await this.jobService.updateJob(id, body);
		return new ResponseSuccess({ data: result });
	}
}
