import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PgDspsSyncService, PgDspsSync } from './pg-dsps-sync.service';

@ApiTags('pg-dsps-sync')
@Controller('pg-dsps-sync')
export class PgDspsSyncController {
  constructor(private readonly pgDspsSyncService: PgDspsSyncService) {}

  @Get()
  async findAll(): Promise<ResponseSuccess<PgDspsSync[]>> {
    const result = await this.pgDspsSyncService.findAll();
    return new ResponseSuccess({ data: result });
  }

  @Get(':uuid')
  async findByUuid(@Param('uuid') uuid: string): Promise<ResponseSuccess<PgDspsSync | null>> {
    const result = await this.pgDspsSyncService.findByUuid(uuid);
    return new ResponseSuccess({ data: result });
  }

  @Get(':uuid/dsps-reports')
  async getDspsReports(@Param('uuid') uuid: string): Promise<ResponseSuccess<any[]>> {
    const result = await this.pgDspsSyncService.getDspsReports(uuid);
    return new ResponseSuccess({ data: result });
  }
}