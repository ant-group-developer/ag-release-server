import { BadRequestException, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CiToolService } from './ci-tool.service';
import { Express } from 'express';

@ApiTags('CI Tool')
@Controller('ci-tool')
export class CiToolController {
    constructor(
        private readonly ciToolService: CiToolService,
    ) { }

    @Post('export')
    @ApiOperation({ summary: 'Upload excel export to CI Tool' })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file'))
    async sendFileExportToCi(@UploadedFile() file: any) {
        if (!file) {
            throw new BadRequestException('Missing file. Use form-data key = file');
        }

        const result = await this.ciToolService.sendFileExportToCi(file);

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
    async getExportJobStatus(
        @Param('jobId') jobId: string,
    ) {
        const result =
            await this.ciToolService.getExportJobStatus(jobId);

        return new ResponseSuccess({
            data: result,
        });
    }
}