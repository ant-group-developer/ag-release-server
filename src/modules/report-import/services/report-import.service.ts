import { Injectable, BadRequestException, NotFoundException, Logger, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ReportDetectorService } from './report-detector.service';
import { ReportImportQueueService } from './report-import-queue.service';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { ImportJobSourceType, ImportJobStatus, ImportJob } from '../../etl/interfaces';
import { Label } from '../../label/entities/label.entity';

@Injectable()
export class ReportImportService {
  private readonly logger = new Logger(ReportImportService.name);

  constructor(
    private readonly detectorService: ReportDetectorService,
    private readonly queueService: ReportImportQueueService,
    private readonly r2Service: BucketR2Service,
    private readonly importJobsService: ImportJobsService,
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,
  ) {}

  /**
   * Pre-validate file list, generate R2 presigned URLs, and initialize ImportJob
   */
  async preValidate(
    files: Array<{ path: string; size: number }>,
    tenantId: string,
    userId: string,
    allowedExtensions?: string[],
    labelId?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Danh sách file trống');
    }

    const selectedLabelId = labelId?.trim();
    if (selectedLabelId) {
      if (!tenantId) {
        throw new BadRequestException('tenantId is required when labelId is provided');
      }

      const label = await this.labelRepo.findOne({
        where: { id: selectedLabelId, tenantId },
      });
      if (!label) {
        throw new BadRequestException('labelId does not belong to the selected tenant');
      }
    }

    const matched: Array<{
      path: string;
      r2Key: string;
      uploadUrl: string;
      size: number;
      sourceCode: string;
      reportType: string;
      parserCode: string;
    }> = [];

    const invalid: Array<{ path: string; reason: string }> = [];
    const jobId = uuidv4();

    for (const f of files) {
      if (allowedExtensions && allowedExtensions.length > 0) {
        const ext = path.extname(f.path).toLowerCase().replace('.', '');
        if (!allowedExtensions.map((e) => e.toLowerCase()).includes(ext)) {
          invalid.push({
            path: f.path,
            reason: `Định dạng file .${ext} không nằm trong danh sách được phép [${allowedExtensions.join(', ')}]`,
          });
          continue;
        }
      }

      const config = await this.detectorService.detectConfig(f.path);
      if (!config) {
        invalid.push({
          path: f.path,
          reason: 'Không khớp cấu hình regex hoặc thư mục nguồn',
        });
        continue;
      }

      // Generate a unique path for the file in R2 under the jobId folder
      const filename = path.basename(f.path);
      const r2Key = `reports/${jobId}/${filename}`;

      try {
        const uploadUrl = await this.r2Service.getSignedUrlUpload({
          key: r2Key,
          isPublic: false,
          contentType: 'text/csv', // Default to text/csv, since these are DSP reports
        });

        matched.push({
          path: f.path,
          r2Key,
          uploadUrl,
          size: f.size,
          sourceCode: config.sourceCode,
          reportType: config.reportType,
          parserCode: config.parserCode,
        });
      } catch (err) {
        this.logger.error(`Failed to generate signed URL for ${f.path}: ${err.message}`);
        invalid.push({
          path: f.path,
          reason: `Lỗi sinh presigned URL: ${err.message}`,
        });
      }
    }

    if (matched.length === 0) {
      return {
        jobId: null,
        matched,
        invalid,
      };
    }

    const totalSizeBytes = matched.reduce((acc, f) => acc + f.size, 0);
    const fileNames = matched.map((m) => path.basename(m.path));

    // Create the PENDING ImportJob to track this upload folder batch
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.REPORT_UPLOAD,
      params: { files: matched, labelId: selectedLabelId || undefined },
      fileName: fileNames.join(', '),
      fileSizeBytes: totalSizeBytes,
      progressTotal: matched.length,
      tenantId,
      createdBy: userId,
    });

    return {
      jobId: job.id,
      matched: matched.map((m) => ({
        path: m.path,
        r2Key: m.r2Key,
        uploadUrl: m.uploadUrl,
      })),
      invalid,
    };
  }

  /**
   * Verify uploaded files in R2 and start worker processing ngầm via Redis Queue
   */
  async startJob(jobId: string): Promise<ImportJob> {
    try {
      // Use in-memory snapshot first, fallback to ClickHouse query
      // This avoids the ReplacingMergeTree eventual-consistency race condition
      // where a freshly-created job might not be visible via FINAL query yet.
      let job = this.importJobsService.getSnapshot(jobId);
      if (!job) {
        job = await this.importJobsService.findById(jobId);
      }
      if (!job) {
        throw new NotFoundException(`Không tìm thấy Job ID: ${jobId}`);
      }

      if (job.status === ImportJobStatus.QUEUED) {
        return job;
      }

      if (job.status !== ImportJobStatus.PENDING && job.status !== ImportJobStatus.FAILED) {
        throw new BadRequestException(`Job đang ở trạng thái ${job.status}, không thể bắt đầu lại.`);
      }

      const files = (job.params?.files as Array<{ r2Key: string; path: string }>) || [];
      if (files.length === 0) {
        throw new BadRequestException('Không có file nào để import trong Job này.');
      }

      const bucketName = this.r2Service.getBucketName({ isPublic: false });

      const reportImportState = job.params?.reportImportState as
        | { files?: Record<string, { status?: string }> }
        | undefined;

      // Verify all matched files that may still need fact import exist in R2.
      const missingFiles: string[] = [];
      for (const file of files) {
        const fileKey = file.r2Key || file.path;
        if (reportImportState?.files?.[fileKey]?.status === 'FACT_IMPORTED') {
          continue;
        }

        try {
          await this.r2Service.findOne({
            bucketName,
            key: file.r2Key,
          });
        } catch (err) {
          const fileName = path.basename(file.path);
          this.logger.error(`R2 verification failed for ${fileName}: ${err.message}`);
          missingFiles.push(fileName);
        }
      }

      if (missingFiles.length > 0) {
        const errorMsg = `File chưa được upload lên R2 hoặc bị thiếu: ${missingFiles.join(', ')}`;
        // Log lỗi vào job record để có thể debug trên production
        await this.importJobsService.markFailed(jobId, errorMsg).catch(() => {});
        throw new BadRequestException(errorMsg);
      }

      // Push jobId to Redis Queue
      try {
        await this.queueService.pushJob(job.id);
        job = await this.importJobsService.markQueued(job.id);
      } catch (err) {
        const errorMsg = `Không thể đẩy job vào Redis Queue: ${err.message}`;
        this.logger.error(errorMsg);
        await this.importJobsService.markFailed(jobId, errorMsg).catch(() => {});
        throw new BadRequestException(errorMsg);
      }

      return job;
    } catch (err) {
      this.logger.error(`Error in startJob for Job ID ${jobId}: ${err.message}`, err.stack);
      
      // If it is a known client/validation HTTP exception (e.g. status !== PENDING or NotFound),
      // we do NOT mark the job as FAILED to prevent overwriting processing/completed states.
      if (err instanceof HttpException) {
        throw err;
      }

      // Attempt to log error message to the job status in ClickHouse so UI can display it
      await this.importJobsService.markFailed(jobId, `startJob 500 error: ${err.message}`).catch((dbErr) => {
        this.logger.error(`Failed to update job status to FAILED in ClickHouse: ${dbErr.message}`);
      });
      throw err;
    }
  }
}
