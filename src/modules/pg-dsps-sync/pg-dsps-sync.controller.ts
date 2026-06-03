import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PgDspsSyncService, PgDspsSyncResponse } from './pg-dsps-sync.service';
import { DspsReportResponse } from '../dsp-report/dsp-report.service';

@ApiTags('pg-dsps-sync')
@Controller('pg-dsps-sync')
export class PgDspsSyncController {
  constructor(private readonly pgDspsSyncService: PgDspsSyncService) {}

  @Get()
  async findAll(): Promise<ResponseSuccess<PgDspsSyncResponse[]>> {
    const result = await this.pgDspsSyncService.findAll();
    return new ResponseSuccess({ data: result });
  }

  @Get(':uuid')
  async findByUuid(@Param('uuid') uuid: string): Promise<ResponseSuccess<PgDspsSyncResponse | null>> {
    const result = await this.pgDspsSyncService.findByUuid(uuid);
    return new ResponseSuccess({ data: result });
  }

  @Get(':uuid/dsps-reports')
  async getDspsReports(@Param('uuid') uuid: string): Promise<ResponseSuccess<DspsReportResponse[]>> {
    const result = await this.pgDspsSyncService.getDspsReports(uuid);
    return new ResponseSuccess({ data: result });
  }
}