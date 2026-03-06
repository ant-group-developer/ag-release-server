// src/modules/file-node/dto/file-node.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { FileNodeType } from '../entities/file-node.entity';

export class CreateFileNodeDto {
	@ApiProperty({ example: 'covers', description: 'Tên file/folder' })
	@IsString()
	@MaxLength(255)
	name: string;

	@ApiProperty({ enum: FileNodeType, example: FileNodeType.FOLDER })
	@IsEnum(FileNodeType)
	type: FileNodeType;

	@ApiPropertyOptional({
		example: 'e1b7c2f3-9fd3-4bb2-9ab0-0f4f6db7d8c1',
		nullable: true,
	})
	@IsOptional()
	@IsUUID()
	parentId?: string | null;

	@ApiPropertyOptional({ example: 123456, nullable: true })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	size?: number | null;
}

export class UpdateFileNodeDto {
	@ApiPropertyOptional({ example: 'covers_v2' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@ApiPropertyOptional({ enum: FileNodeType, example: FileNodeType.FILE })
	@IsOptional()
	@IsEnum(FileNodeType)
	type?: FileNodeType;

	@ApiPropertyOptional({
		example: 'e1b7c2f3-9fd3-4bb2-9ab0-0f4f6db7d8c1',
		nullable: true,
	})
	@IsOptional()
	@IsUUID()
	parentId?: string | null;

	@ApiPropertyOptional({ example: 123456, nullable: true })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	size?: number | null;
}

export class MoveFileNodeDto {
	@ApiPropertyOptional({
		example: 'e1b7c2f3-9fd3-4bb2-9ab0-0f4f6db7d8c1',
		nullable: true,
	})
	@IsOptional()
	@IsUUID()
	parentId?: string | null;
}

export class GetListFileNodesDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		example: 'e1b7c2f3-9fd3-4bb2-9ab0-0f4f6db7d8c1',
		nullable: true,
		description: 'Lọc theo parentId (null = root)',
	})
	@IsOptional()
	@IsUUID()
	parentId?: string | null;

	@ApiPropertyOptional({ enum: FileNodeType })
	@IsOptional()
	@IsEnum(FileNodeType)
	type?: FileNodeType;

	@ApiPropertyOptional({
		example: ['cover', 'wav'],
		description: 'Keyword array (search name)',
	})
	@IsOptional()
	keyword?: string[];
}
