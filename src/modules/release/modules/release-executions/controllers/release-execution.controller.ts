import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
