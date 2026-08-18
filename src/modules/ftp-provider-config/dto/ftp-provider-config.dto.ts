// src/modules/ftp-provider-config/dto/ftp-provider-config.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderFtpProviderConfig } from '../const/ftp-provider-config.const';

export class CreateFtpProviderConfigDto {
	@ApiProperty({ example: 'merlin', description: 'Slug định danh provider' })
	@IsString()
	@MaxLength(50)
	code: string;

	@ApiProperty({ example: 'Merlin' })
	@IsString()
	@MaxLength(100)
	name: string;

	@ApiProperty({ example: 'ftp.merlin.example.com' })
	@IsString()
	host: string;

	@ApiPropertyOptional({ example: 21, default: 21 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	port?: number = 21;

	@ApiProperty({ example: 'username' })
	@IsString()
	username: string;

	@ApiProperty({ example: 'plain-text-password', description: 'Sẽ được mã hoá trước khi lưu' })
	@IsString()
	password: string;

	@ApiPropertyOptional({
		enum: ['true', 'false', 'explicit', 'implicit'],
		default: 'explicit',
	})
	@IsOptional()
	@IsIn(['true', 'false', 'explicit', 'implicit'])
	secure?: string = 'explicit';

	@ApiPropertyOptional({ example: '/root', default: '/root' })
	@IsOptional()
	@IsString()
	basePath?: string = '/root';

	@ApiPropertyOptional({
		description:
			'Đặt true để dùng provider này cho luồng sync (tự động deactivate provider đang active khác)',
		default: false,
	})
	@IsOptional()
	@IsBoolean()
	isActive?: boolean = false;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string | null;
}

export class UpdateFtpProviderConfigDto extends PartialType(
	CreateFtpProviderConfigDto,
) {}

export class GetListFtpProviderConfigsDto extends BaseQueryDto2 {
	@IsOptional()
	fieldOrder: string = FieldOrderFtpProviderConfig.createdAt;
}

export class TestFtpProviderConnectionDto {
	@ApiProperty({ example: 'ftp.merlin.example.com' })
	@IsString()
	host: string;

	@ApiPropertyOptional({ example: 21, default: 21 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	port?: number = 21;

	@ApiProperty({ example: 'username' })
	@IsString()
	username: string;

	@ApiProperty({ example: 'plain-text-password' })
	@IsString()
	password: string;

	@ApiPropertyOptional({
		enum: ['true', 'false', 'explicit', 'implicit'],
		default: 'explicit',
	})
	@IsOptional()
	@IsIn(['true', 'false', 'explicit', 'implicit'])
	secure?: string = 'explicit';
}

export class PartialTestFtpProviderConnectionDto extends PartialType(
	TestFtpProviderConnectionDto,
) {}
