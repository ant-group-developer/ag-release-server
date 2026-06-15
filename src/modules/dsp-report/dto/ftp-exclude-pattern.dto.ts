import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export enum PatternType {
  CONTAINS = 'contains',
  REGEX = 'regex',
}

export enum PatternScope {
  FOLDER = 'folder',
  FILE = 'file',
}

export class CreateExcludePatternDto {
  @ApiProperty({ description: 'Chuỗi keyword hoặc regex. Ví dụ: .removed_at', example: '.removed_at' })
  @IsString()
  pattern: string;

  @ApiProperty({ enum: PatternType, description: "'contains' hoặc 'regex'" })
  @IsEnum(PatternType)
  patternType: PatternType;

  @ApiProperty({
    enum: PatternScope,
    isArray: true,
    description: "Mảng scope áp dụng: 'folder' hoặc 'file' hoặc cả hai",
    example: ['folder', 'file'],
  })
  @IsArray()
  @IsEnum(PatternScope, { each: true })
  scope: PatternScope[];

  @ApiPropertyOptional({ description: 'Bật/tắt pattern ngay khi tạo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Mô tả mục đích pattern' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateExcludePatternDto {
  @ApiPropertyOptional({ description: 'Chuỗi keyword hoặc regex' })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional({ enum: PatternType })
  @IsOptional()
  @IsEnum(PatternType)
  patternType?: PatternType;

  @ApiPropertyOptional({
    enum: PatternScope,
    isArray: true,
    description: "Mảng scope áp dụng: 'folder' hoặc 'file' hoặc cả hai",
    example: ['folder', 'file'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PatternScope, { each: true })
  scope?: PatternScope[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryExcludePatternDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: PatternType })
  @IsOptional()
  @IsEnum(PatternType)
  patternType?: PatternType;

  @ApiPropertyOptional({ description: '1 = active, 0 = inactive' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  isActive?: number;

  @ApiPropertyOptional({
    type: String,
    description: "Lọc theo scope: 'folder' hoặc 'file'. Truyền nhiều giá trị phân tách bằng dấu phẩy, ví dụ: 'folder,file'",
    example: 'folder,file',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return String(value).split(',').map(v => v.trim()).filter(Boolean);
  })
  @IsArray()
  @IsEnum(PatternScope, { each: true })
  scope?: PatternScope[];
}
