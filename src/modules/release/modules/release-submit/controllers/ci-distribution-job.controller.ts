import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CiDistributionJobService } from '../services/ci-distribution-job.service';
import {
	BatchActionCiJobDto,
	QueryGetListCiJobDto,
} from '../dto/ci-distribution-job.dto';

@ApiTags('CI Distribution Jobs')
@Controller('ci-distribution-jobs')
export class CiDistributionJobController {
	constructor(private readonly jobService: CiDistributionJobService) {}

	/** Lấy danh sách jobs (phân trang + lọc theo type, status, upc) */
	@Get()
	async getList(@Query() query: QueryGetListCiJobDto) {
		const result = await this.jobService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết job */
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.jobService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	/**
	 * Auto Send Email — chọn nhiều jobs → hệ thống tạo Excel → gửi email tự động
	 * Sau khi gửi → mark completed → resume pipeline
	 */
	@Post('auto-send-email')
	async autoSendEmail(@Body() body: BatchActionCiJobDto) {
		const result = await this.jobService.autoSendEmail(body.ids);
		return new ResponseSuccess({ data: result });
	}

	/**
	 * Download Excel — chọn nhiều jobs → tải file Excel về cho admin gửi bằng tay
	 * Mark jobs → PROCESSING (chờ admin xác nhận)
	 */
	@Post('download-excel')
	async downloadExcel(@Body() body: BatchActionCiJobDto, @Res() res: Response) {
		const { buffer, fileName } = await this.jobService.downloadExcel(body.ids);

		res.set({
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${fileName}"`,
			'Content-Length': buffer.length,
		});
		res.end(buffer);
	}

	/**
	 * Admin xác nhận đã gửi file → mark completed → resume pipeline
	 */
	@Post('confirm-completed')
	async confirmCompleted(@Body() body: BatchActionCiJobDto) {
		const result = await this.jobService.confirmCompleted(body.ids);
		return new ResponseSuccess({ data: result });
	}

	/** Huỷ 1 job */
	@Post(':id/cancel')
	async cancelJob(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.jobService.cancelJob(id);
		return new ResponseSuccess({ data: result });
	}
}
