import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CiToolService } from './ci-tool.service';

@ApiTags('CI Tool')
@Controller('ci-tool')
export class CiToolController {
	constructor(private readonly ciToolService: CiToolService) {}

	@Get('token')
	@ApiOperation({ summary: 'Get CI Tool token' })
	async getTokenCi() {
		const token = await this.ciToolService.getTokenCi();

		return new ResponseSuccess({
			data: token,
		});
	}

	@Post('export')
	@ApiOperation({ summary: 'Upload excel export to CI Tool' })
	@ApiConsumes('multipart/form-data')
	@UseInterceptors(FileInterceptor('file'))
	async sendFileExportToCi(@UploadedFile() file: any) {
		if (!file) {
			throw new BadRequestException(
				'Missing file. Use form-data key = file',
			);
		}

		const result = await this.ciToolService.sendFileExportToCi(file);

		return new ResponseSuccess({ data: result });
	}

	@Post('takedown')
	@ApiOperation({ summary: 'Upload excel takedown to CI Tool' })
	@ApiConsumes('multipart/form-data')
	@UseInterceptors(FileInterceptor('file'))
	async sendFileTakedownToCi(@UploadedFile() file: any) {
		if (!file) {
			throw new BadRequestException(
				'Missing file. Use form-data key = file',
			);
		}

		const result = await this.ciToolService.sendFileTakedownToCi(file);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Get CI Tool export job status',
	})
	@ApiParam({
		name: 'jobId',
		type: String,
	})
	@Get('export/job/:jobId')
	async getExportJobStatus(@Param('jobId') jobId: string) {
		const result = await this.ciToolService.getExportJobStatus(jobId);

		return new ResponseSuccess({
			data: result,
		});
	}
}
