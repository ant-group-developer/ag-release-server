import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { WmgImportService, WmgImportResult } from '../services/import/wmg-import.service';
import { WmgImportDto } from '../dto/wmg-import.dto';

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
  @ApiOperation({
    summary: 'Import WMG partner sales CSV report',
    description:
      'Upload a WMG sales CSV file. Supports multi-DSP files, album-level rows (synthetic ISRC = REL-{UPC}), and Excel-quoted numeric cells. Streams data to ClickHouse in 50K-row batches. Max 500MB.',
  })
  @ApiConsumes('multipart/form-data')
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
  ): Promise<WmgImportResult> {
    if (!file) {
      throw new BadRequestException('Missing file. Use multipart/form-data with key = file');
    }
    return this.wmgImportService.importFile(file.path, {
      revenueCurrency: dto.revenueCurrency,
      memberName: dto.memberName,
      source: dto.source,
    });
  }
}
