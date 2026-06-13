import { Controller, Post, Get, Param, Body, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { ReportImportService } from '../services/report-import.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import {
  PreValidateRequestDto,
  ReportImportStartResponseDto,
  ReportImportStatusResponseDto,
} from '../dto/report-import.dto';
import { User } from '../../../common/decorators/req.decorators';
import { ResponseSuccess } from '../../../common/dtos/common.response.dto';
import { SystemAdminOnly } from '../../auth/decorators/auth.decorator';
import {
  ReportImportPreValidateResponse,
  ReportImportStartResponse,
  ReportImportStatusResponse,
} from '../interfaces/report-import.interface';

@ApiTags('Report Import')
@Controller('report-import')
export class ReportImportController {
  constructor(
    private readonly reportImportService: ReportImportService,
    private readonly importJobsService: ImportJobsService,
  ) {}

  @SystemAdminOnly()
  @Post('pre-validate')
  @ApiOperation({
    summary: 'Pre-validate file paths and retrieve R2 presigned upload URLs',
    description: 'Verifies files match regex rules and returns R2 upload URLs.',
  })
  async preValidate(
    @Body() body: PreValidateRequestDto,
    @User() user: any,
  ): Promise<ResponseSuccess<ReportImportPreValidateResponse>> {
    const result = await this.reportImportService.preValidate(
      body.files,
      body.tenantId || user?.tenantId,
      user?.sub,
      body.allowedExtensions,
    );
    return new ResponseSuccess({
      data: result,
    });
  }

  @SystemAdminOnly()
  @Post('jobs/:jobId/start')
  @ApiOperation({
    summary: 'Trigger job processing after uploading files to R2',
    description: 'Enqueues the validated upload job to Redis for background execution.',
  })
  @ApiParam({ name: 'jobId', description: 'ID of the pre-validated import job' })
  async startJob(
    @Param('jobId') jobId: string,
  ): Promise<ResponseSuccess<ReportImportStartResponse>> {
    const job = await this.reportImportService.startJob(jobId);
    return new ResponseSuccess({
      data: new ReportImportStartResponseDto(job),
    });
  }

  @SystemAdminOnly()
  @Get('jobs/:jobId/status')
  @ApiOperation({
    summary: 'Get status of a report import job',
    description: 'Poll this endpoint to track upload import progress.',
  })
  @ApiParam({ name: 'jobId', description: 'ID of the import job' })
  async getJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<ResponseSuccess<ReportImportStatusResponse>> {
    const job = await this.importJobsService.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Không tìm thấy Job ID: ${jobId}`);
    }
    return new ResponseSuccess({
      data: new ReportImportStatusResponseDto(job),
    });
  }
}
