import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess, PageDto } from 'src/common/dtos/common.response.dto';
import { ExcludePatternService, ExcludePatternRecord } from '../services/ftp-exclude-pattern.service';
import { CreateExcludePatternDto, UpdateExcludePatternDto, QueryExcludePatternDto } from '../dto/ftp-exclude-pattern.dto';

@ApiTags('ftp-exclude-patterns')
@Controller('ftp-exclude-patterns')
export class FtpExcludePatternController {
  constructor(private readonly svc: ExcludePatternService) {}

  @Get()
  @ApiOperation({ summary: 'List FTP exclude patterns', description: 'Trả về danh sách pattern đang config. Hỗ trợ filter theo scope, patternType, isActive.' })
  async findAll(
    @Query() query: QueryExcludePatternDto,
  ): Promise<ResponseSuccess<PageDto<ExcludePatternRecord>>> {
    const data = await this.svc.findAll(query);
    return new ResponseSuccess({ data });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get exclude pattern by id' })
  async findById(@Param('id') id: string): Promise<ResponseSuccess<ExcludePatternRecord | null>> {
    const data = await this.svc.findById(id);
    return new ResponseSuccess({ data });
  }

  @Post()
  @ApiOperation({
    summary: 'Create FTP exclude pattern',
    description: 'Tạo pattern chặn folder/file khi sync FTP. patternType: contains (chứa chuỗi) hoặc regex. scope: folder | file | both.',
  })
  async create(@Body() dto: CreateExcludePatternDto): Promise<ResponseSuccess<ExcludePatternRecord>> {
    const data = await this.svc.create(dto);
    return new ResponseSuccess({ data });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update FTP exclude pattern' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExcludePatternDto,
  ): Promise<ResponseSuccess<ExcludePatternRecord>> {
    const data = await this.svc.update(id, dto);
    return new ResponseSuccess({ data });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete FTP exclude pattern (soft delete)' })
  async remove(@Param('id') id: string): Promise<ResponseSuccess<{ success: boolean }>> {
    await this.svc.remove(id);
    return new ResponseSuccess({ data: { success: true } });
  }
}
