import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { QueryGetListReleaseExecutionDto } from '../dto/release-execution.dto';
import { ReleaseExecutionProcessorService } from '../services/release-execution-processor.service';
import { ReleaseExecutionsService } from '../services/release-executions.service';

@ApiTags('Release Executions')
@Controller('release-executions')
export class ReleaseExecutionController {
    constructor(
        private readonly executionsService: ReleaseExecutionsService,
        private readonly processorService: ReleaseExecutionProcessorService,
    ) {}

    @Post()
    async create(@Body() body: Record<string, any>) {
        const result = await this.executionsService.create(body);
        return new ResponseSuccess({ data: result });
    }

    @Post('manual-export/bulk-download')
    async bulkDownload(
        @Body() body: { ids: string[] },
        @Res() res: Response
    ) {
        const { buffer, fileName } = await this.executionsService.getBulkManualExportBuffer(body.ids);
        
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Post('manual-export/bulk-download-and-mark-completed')
    async bulkDownloadAndMarkCompleted(
        @Body() body: { ids: string[] },
        @Res() res: Response
    ) {
        const { buffer, fileName } = await this.executionsService.bulkDownloadAndMarkCompleted(body.ids);
        
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Post(':id/process')
    async triggerProcess(@Param('id', ParseUUIDPipe) id: string) {
        // Thực tế hàm này sẽ được BullMQ gọi ngầm, nhưng ta viết endpoint tạm để test
        await this.processorService.processQueueItem(id);
        return new ResponseSuccess({ message: 'Execution processed successfully' });
    }

    @Post(':id/prepareExecutionPlan')
    async prepareExecutionPlan(@Param('id', ParseUUIDPipe) id: string) {
        // Thực tế hàm này sẽ được BullMQ gọi ngầm, nhưng ta viết endpoint tạm để test
        await this.processorService.prepareExecutionPlan(id);
        return new ResponseSuccess({ message: 'Execution processed successfully' });
    }

    @Post(':id/runExecutionPlan')
    async runExecutionPlan(@Param('id', ParseUUIDPipe) id: string) {
        // Thực tế hàm này sẽ được BullMQ gọi ngầm, nhưng ta viết endpoint tạm để test
        await this.processorService.runExecutionPlan(id);
        return new ResponseSuccess({ message: 'Execution processed successfully' });
    }

    @Post(':id/manual-export/mark-completed')
    async markManualExportCompleted(@Param('id', ParseUUIDPipe) id: string) {
        await this.executionsService.markManualExportAsCompleted(id);
        return new ResponseSuccess({ message: 'Marked as completed' });
    }

    @Post(':id/manual-export/download-and-mark-completed')
    async downloadAndMarkCompleted(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response
    ) {
        const { buffer, fileName } = await this.executionsService.downloadAndMarkCompleted(id);
        
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Post(':id/retry')
    async retry(
        @Param('id', ParseUUIDPipe) id: string,
        @UserId() userId: string
    ) {
        this.executionsService.retryExecution(id, userId).catch((_e) => {_e})
        return new ResponseSuccess();
    }

    @Get()
    async getList(@Query() query: QueryGetListReleaseExecutionDto) {
        const result = await this.executionsService.getList(query);
        return new ResponseSuccess({ data: result });
    }

    @Get(':id/release-execution-dsp')
    async getExecutionDsps(@Param('id', ParseUUIDPipe) id: string) {
        const result = await this.executionsService.getExecutionDsps(id);
        return new ResponseSuccess({ data: result });
    }

    @Get(':id/manual-export/download')
    async downloadManualExport(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response
    ) {
        const { buffer, fileName } = await this.executionsService.getManualExportBuffer(id);
        
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }

    @Get(':id')
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const result = await this.executionsService.findOne(id);
        return new ResponseSuccess({ data: result });
    }

    @Delete(':id')
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        await this.executionsService.remove(id);
        return new ResponseSuccess();
    }
}
