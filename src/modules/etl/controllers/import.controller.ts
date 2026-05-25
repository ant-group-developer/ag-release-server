import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { ImportService, ImportResult } from '../services/import/import.service';

@ApiTags('ETL')
@Controller('etl')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('import')
  @ApiOperation({
    summary: 'Import DSP data from a local folder',
    description: 'Scans the given local folder for DSP sub-folders, parses all files, and bulk inserts into ClickHouse',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        dataPath: { type: 'string', example: '/app/data/202508/202508' },
      },
    },
  })
  async importData(@Body() body: { dataPath: string }): Promise<ImportResult> {
    const dataPath = body.dataPath || '/app/data/202508/202508';
    return this.importService.importFolder(dataPath);
  }
}
