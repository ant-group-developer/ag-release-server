import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { ReportDetectorService } from './report-detector.service';
import { ReportImportQueueService } from './report-import-queue.service';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { ImportJobSourceType, ImportJobStatus, ImportJob } from '../../etl/interfaces';

@Injectable()
export class ReportImportService {
  private readonly logger = new Logger(ReportImportService.name);

  constructor(
    private readonly detectorService: ReportDetectorService,
    private readonly queueService: ReportImportQueueService,
    private readonly r2Service: BucketR2Service,
    private readonly importJobsService: ImportJobsService,
  ) {}

  /**
   * Pre-validate file list, generate R2 presigned URLs, and initialize ImportJob
   */
  async preValidate(
    files: Array<{ path: string; size: number }>,
    tenantId: string,
    userId: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Danh sách file trống');
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
      const config = this.detectorService.detectConfig(f.path);
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

    // Create the PENDING ImportJob to track this upload folder batch
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.REPORT_UPLOAD,
      params: { files: matched },
      fileName: `Upload: ${matched.length} file(s)`,
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
    const job = await this.importJobsService.findById(jobId);
    if (!job) {
      throw new NotFoundException(`Không tìm thấy Job ID: ${jobId}`);
    }

    if (job.status !== ImportJobStatus.PENDING) {
      throw new BadRequestException(`Job đang ở trạng thái ${job.status}, không thể bắt đầu lại.`);
    }

    const files = (job.params?.files as Array<{ r2Key: string; path: string }>) || [];
    if (files.length === 0) {
      throw new BadRequestException('Không có file nào để import trong Job này.');
    }

    const bucketName = this.r2Service.getBucketName({ isPublic: false });

    // Verify all matched files exist in R2
    for (const file of files) {
      try {
        await this.r2Service.findOne({
          bucketName,
          key: file.r2Key,
        });
      } catch (err) {
        throw new BadRequestException(
          `File chưa được upload lên Cloudflare R2 hoặc bị thiếu: ${path.basename(file.path)}`,
        );
      }
    }

    // Push jobId to Redis Queue
    await this.queueService.pushJob(job.id);

    return job;
  }
}
