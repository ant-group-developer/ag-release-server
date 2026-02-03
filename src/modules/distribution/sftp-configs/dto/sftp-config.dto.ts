// src/modules/sftp-configs/dto/sftp-config.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsObject, IsOptional, IsUUID, MaxLength } from 'class-validator';
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

export class UpdateSftpConfigDto extends PartialType(CreateSftpConfigDto) {}

export class GetListSftpConfigsDto extends BaseQueryDto2 {
	@IsOptional()
	fieldOrder: string = FieldOrderSftpConfig.createdAt;
}
