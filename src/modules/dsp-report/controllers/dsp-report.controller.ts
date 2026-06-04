import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { DspReportService, DspsReportResponse } from '../services/dsp-report.service';
import { QueryGetListDspReportDto, CreateDspReportDto, AssignDspReportDto } from '../dto/dsp-report.dto';

@ApiTags('dsp-report')
@Controller('dsp-report')
export class DspReportController {
  constructor(private readonly dspReportService: DspReportService) { }

  @Get()
  async findAll(
    @Query() query: QueryGetListDspReportDto,
  ): Promise<ResponseSuccess<PageDto<DspsReportResponse>>> {
    const { items, totalItems } = await this.dspReportService.findAll(query);
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

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ResponseSuccess<DspsReportResponse | null>> {
    const result = await this.dspReportService.findById(id);
    return new ResponseSuccess({ data: result });
  }

  @Post()
  async create(@Body() dto: CreateDspReportDto): Promise<ResponseSuccess<DspsReportResponse>> {
    const result = await this.dspReportService.create(dto.dspName, dto.source);
    return new ResponseSuccess({ data: result });
  }

  @Put(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignDspReportDto,
  ): Promise<ResponseSuccess<{ success: boolean; message: string }>> {
    await this.dspReportService.assignToPgDspsSync(id, dto.pgUuid);
    return new ResponseSuccess({
      data: { success: true, message: `dsps_report ${id} assigned to pg_uuid ${dto.pgUuid}` },
    });
  }

  @Put(':id/unassign')
  async unassign(@Param('id') id: string): Promise<ResponseSuccess<{ success: boolean; message: string }>> {
    await this.dspReportService.unassign(id);
    return new ResponseSuccess({
      data: { success: true, message: `dsps_report ${id} unassigned` },
    });
  }
}