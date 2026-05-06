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
	BatchActionCiJobDto,
	ConfirmCompletedCiJobDto,
	QueryGetListCiJobDto,
	UpdateCiJobDto,
} from '../dto/ci-distribution-job.dto';
import { CiDistributionJobService } from '../services/ci-distribution-job.service';

@ApiTags('CI Distribution Jobs')
@Controller('ci-distribution-jobs')
export class CiDistributionJobController {
	constructor(private readonly jobService: CiDistributionJobService) {}

	@ApiOperation({ summary: 'Danh sách CI distribution jobs' })
	@ApiQuery({ type: QueryGetListCiJobDto })
	@Get()
	async getList(@Query() query: QueryGetListCiJobDto) {
		const result = await this.jobService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Chi tiết CI distribution job' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.jobService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Auto gửi email — chọn jobs → tạo Excel → gửi email tự động',
		description:
			'Gom các jobs theo deliveryEmail, tạo file Excel, gửi email. Sau khi gửi → mark completed. Nếu tất cả jobs cùng step xong → resume pipeline.',
	})
	@ApiBody({ type: BatchActionCiJobDto })
	@Post('auto-send-email')
	async autoSendEmail(@Body() body: BatchActionCiJobDto) {
		const result = await this.jobService.autoSendEmail(body.ids);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Download Excel — chọn jobs → tải file Excel về',
		description:
			'Tạo file Excel chứa UPC + DSP codes cho admin gửi bằng tay. Mark jobs → PROCESSING (chờ admin xác nhận).',
	})
	@ApiBody({ type: BatchActionCiJobDto })
	@Post('download-excel')
	async downloadExcel(
		@Body() body: BatchActionCiJobDto,
		@Res() res: Response,
	) {
		const { buffer, fileName } = await this.jobService.downloadExcel(
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

	@ApiOperation({
		summary: 'Admin xác nhận đã gửi — mark completed → resume pipeline',
		description:
			'Chỉ áp dụng cho jobs type admin_export. Nếu tất cả jobs cùng step xong → resume pipeline.',
	})
	@ApiBody({ type: ConfirmCompletedCiJobDto })
	@Post('confirm-completed')
	async confirmCompleted(@Body() body: ConfirmCompletedCiJobDto) {
		const result = await this.jobService.confirmCompleted(
			body.ids,
			body.exportIdFromCi,
		);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Huỷ 1 job' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@Post(':id/cancel')
	async cancelJob(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.jobService.cancelJob(id);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Update CI distribution job',
		description:
			'Chỉ cho phép update status = cancel, deliveryEmail, dspCiCodes, deliveryEmailSubject',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateCiJobDto })
	@Put(':id')
	async updateJob(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: UpdateCiJobDto,
	) {
		const result = await this.jobService.updateJob(id, body);
		return new ResponseSuccess({ data: result });
	}
}
