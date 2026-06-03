import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class QueryGetListDspReportDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by assignment status',
    required: false,
    enum: ['assigned', 'unassigned'],
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateDspReportDto {
  @ApiProperty()
  @IsString()
  dspName: string;

  @ApiProperty()
  @IsString()
  source: string;
}

export class AssignDspReportDto {
  @ApiProperty()
  @IsString()
  pgUuid: string;
}
