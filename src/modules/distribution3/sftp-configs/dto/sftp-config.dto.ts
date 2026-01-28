// src/modules/sftp-configs/dto/sftp-config.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderSftpConfig } from '../const/sftp-config.const';
import { SftpMetadata } from '../type/sftp-config.type';

export class CreateSftpConfigDto {
	@ApiPropertyOptional({
		format: 'uuid',
		description: 'Sftp config id (dùng cho upsert)',
	})
	@IsOptional()
	@IsUUID()
	id?: string;

	@ApiProperty({ example: 'DSP_01' })
	@IsOptional()
	@MaxLength(10)
	dspId?: string | null;

	@ApiProperty({ format: 'uuid' })
	// @IsUUID()
	@IsOptional()
	aggregatorId?: string | null;

	@ApiPropertyOptional({
		type: Object,
		example: { host: 'sftp.example.com', port: 22 },
	})
	@IsOptional()
	@IsObject()
	metadata?: SftpMetadata;
}

export class UpdateSftpConfigDto {
	@ApiPropertyOptional({ example: 'DSP_01' })
	@IsOptional()
	@IsString()
	@MaxLength(10)
	dspId?: string;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	aggregatorId?: string;

	@ApiPropertyOptional({ type: Object })
	@IsOptional()
	@IsObject()
	metadata?: Record<string, any>;
}

export class GetListSftpConfigsDto extends BaseQueryDto2 {
	@IsOptional()
	fieldOrder: string = FieldOrderSftpConfig.createdAt;
}
