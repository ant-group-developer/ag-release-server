import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ReleaseDspDeliveryLogService } from './release-dsp-delivery-log.service';
import { CreateReleaseDspDeliveryLogDto } from './dto/create-release-dsp-delivery-log.dto';
import { UpdateReleaseDspDeliveryLogDto } from './dto/update-release-dsp-delivery-log.dto';
import { QueryGetListReleaseDspDeliveryLogDto } from './dto/query-release-dsp-delivery-log.dto';

@ApiTags('Release DSP Delivery Log')
@Controller('release-dsp-delivery-log')
export class ReleaseDspDeliveryLogController {
  constructor(
    private readonly releaseDspDeliveryLogService: ReleaseDspDeliveryLogService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Tạo log DSP delivery' })
  @ApiResponse({ status: 201, description: 'Tạo log thành công' })
  create(@Body() dto: CreateReleaseDspDeliveryLogDto) {
    return this.releaseDspDeliveryLogService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách log DSP delivery' })
  @ApiResponse({ status: 200, description: 'Danh sách log' })
  findAll(@Query() query: QueryGetListReleaseDspDeliveryLogDto) {
    return this.releaseDspDeliveryLogService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết log' })
  @ApiParam({ name: 'id', description: 'ID log', type: 'string' })
  findOne(@Param('id') id: string) {
    return this.releaseDspDeliveryLogService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật log' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReleaseDspDeliveryLogDto,
  ) {
    return this.releaseDspDeliveryLogService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa log' })
  remove(@Param('id') id: string) {
    return this.releaseDspDeliveryLogService.remove(id);
  }
}