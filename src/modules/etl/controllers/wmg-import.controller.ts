import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { WmgImportService } from '../services/import/wmg-import.service';
import { WmgImportDto } from '../dto/wmg-import.dto';
import { User } from '../../../common/decorators/req.decorators';

const UPLOAD_DIR = './uploads/wmg';

@ApiTags('ETL')
@Controller('etl')
export class WmgImportController {
  constructor(private readonly wmgImportService: WmgImportService) {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }

  @Post('import/wmg')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Import WMG partner sales CSV report (async)',
    description:
      'Upload a WMG sales CSV file, returns a jobId immediately (HTTP 202). ' +
      'Worker parses + streams to ClickHouse in background. ' +
      'Poll status at GET /etl/jobs/:id. Max file size 500MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 202,
    description: 'Job queued. Returns { jobId, status, statusUrl }',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (
          _req: any,
          file: any,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const ext = path.extname(file.originalname) || '.csv';
          cb(null, `wmg-${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    }),
  )
  async importWmg(
    @UploadedFile() file: any,
    @Body() dto: WmgImportDto,
    @User() user: any,
  ): Promise<{ jobId: string; status: string; statusUrl: string; message: string }> {
    if (!file) {
      throw new BadRequestException('Missing file. Use multipart/form-data with key = file');
    }

    const job = await this.wmgImportService.enqueue(
      file.path,
      file.originalname,
      file.size,
      {
        revenueCurrency: dto.revenueCurrency,
        memberName: dto.memberName,
        source: dto.source,
      },
      {
        tenantId: user?.tenantId,
        userId: user?.sub,
      },
    );

    return {
      jobId: job.id,
      status: job.status,
      statusUrl: `/etl/jobs/${job.id}`,
      message: `WMG import queued. Poll GET /etl/jobs/${job.id} for status.`,
    };
  }
}
