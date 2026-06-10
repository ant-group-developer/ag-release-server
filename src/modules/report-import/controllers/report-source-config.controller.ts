import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { SystemAdminOnly } from '../../auth/decorators/auth.decorator';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { ReportSourceConfigService } from '../services/report-source-config.service';
import {
  CreateReportSourceConfigDto,
  UpdateReportSourceConfigDto,
  QueryGetListReportSourceConfigDto,
} from '../dto/report-source-config.dto';

@ApiTags('Report Source Configs')
@Controller('report-source-configs')
export class ReportSourceConfigController {
  constructor(private readonly configService: ReportSourceConfigService) {}

  @SystemAdminOnly()
  @Post()
  @ApiOperation({
    summary: 'Create a new report source configuration (Admin Only)',
    description: 'Creates a new config in ClickHouse. The ID will be automatically generated as sourceCode_reportType.',
  })
  async create(
    @Body() dto: CreateReportSourceConfigDto,
  ): Promise<ResponseSuccess<any>> {
    const result = await this.configService.create(dto);
    return new ResponseSuccess({
      data: result,
      messageCode: 'common.success',
    });
  }

  @SystemAdminOnly()
  @Get()
  @ApiOperation({
    summary: 'Get list of active report source configurations (Admin Only)',
    description: 'Retrieves a paginated list of all active report source configs.',
  })
  async getList(
    @Query() query: QueryGetListReportSourceConfigDto,
  ): Promise<ResponseSuccess<PageDto<any>>> {
    const { items, totalItems } = await this.configService.getList(query);
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

  @SystemAdminOnly()
  @Get(':id')
  @ApiOperation({
    summary: 'Get details of a report source configuration (Admin Only)',
    description: 'Retrieves details of a single report source config by its ID.',
  })
  @ApiParam({ name: 'id', description: 'ID of the report source config (e.g. wmg_sales)' })
  async getOne(
    @Param('id') id: string,
  ): Promise<ResponseSuccess<any>> {
    const result = await this.configService.getOne(id);
    return new ResponseSuccess({
      data: result,
    });
  }

  @SystemAdminOnly()
  @Put(':id')
  @ApiOperation({
    summary: 'Update an existing report source configuration (Admin Only)',
    description: 'Updates a report source config in ClickHouse by its ID.',
  })
  @ApiParam({ name: 'id', description: 'ID of the report source config (e.g. wmg_sales)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReportSourceConfigDto,
  ): Promise<ResponseSuccess<any>> {
    const result = await this.configService.update(id, dto);
    return new ResponseSuccess({
      data: result,
      messageCode: 'common.success',
    });
  }

  @SystemAdminOnly()
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a report source configuration (Admin Only)',
    description: 'Soft-deletes (sets is_active = 0) a report source config by its ID.',
  })
  @ApiParam({ name: 'id', description: 'ID of the report source config (e.g. wmg_sales)' })
  async delete(
    @Param('id') id: string,
  ): Promise<ResponseSuccess<any>> {
    const result = await this.configService.delete(id);
    return new ResponseSuccess({
      data: result,
      messageCode: 'common.success',
    });
  }
}
