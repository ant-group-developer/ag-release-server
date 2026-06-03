import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { DspReportService, DspsReportResponse } from './dsp-report.service';

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

class CreateDspReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  dspName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  source: string;
}

class AssignDspReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pgUuid: string;
}

@ApiTags('dsp-report')
@Controller('dsp-report')
export class DspReportController {
  constructor(private readonly dspReportService: DspReportService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['assigned', 'unassigned'], description: 'Filter by assignment status' })
  async findAll(
    @Query('status') status?: string,
  ): Promise<ResponseSuccess<DspsReportResponse[]>> {
    const result = await this.dspReportService.findAll(status);
    return new ResponseSuccess({ data: result });
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