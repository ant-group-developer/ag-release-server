import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PgDspsSyncService, PgDspsSyncResponse } from './pg-dsps-sync.service';
import { DspsReportResponse } from '../dsp-report/dsp-report.service';
import { QueryGetListPgDspsSyncDto } from './dto/pg-dsps-sync.dto';

@ApiTags('pg-dsps-sync')
@Controller('pg-dsps-sync')
export class PgDspsSyncController {
  constructor(private readonly pgDspsSyncService: PgDspsSyncService) {}

  @Get()
  async findAll(
    @Query() query: QueryGetListPgDspsSyncDto,
  ): Promise<ResponseSuccess<PageDto<PgDspsSyncResponse>>> {
    const { items, totalItems } = await this.pgDspsSyncService.findAll(query);
    return new ResponseSuccess({
      data: new PageDto({
        items,
        metadata: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
        },
      }),
    });
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