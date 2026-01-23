// src/modules/distribution/delivery-config/dto/delivery-config.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

export class CreateDeliveryConfigDto {
	@ApiProperty({ example: 'Spotify Direct' })
	@IsString()
	@MaxLength(255)
	name: string;

	@ApiPropertyOptional({
		example: 'SPOTIFY',
		description: 'SPOTIFY | CI | MERLIN | ...',
	})
	@IsOptional()
	@IsString()
	@MaxLength(50)
	providerCode?: string;

	@ApiProperty({ example: 'sftp.example.com' })
	@IsString()
	@MaxLength(255)
	sftpHost: string;

	@ApiProperty({ example: 'username' })
	@IsString()
	@MaxLength(255)
	sftpUsername: string;

	@ApiPropertyOptional({ example: 'ENCRYPTED_TEXT' })
	@IsOptional()
	@IsString()
	sftpPasswordEncrypted?: string;

	@ApiPropertyOptional({ example: '/', default: '/' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	remotePath?: string;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class UpdateDeliveryConfigDto {
	@ApiPropertyOptional({ example: 'Spotify Direct' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@ApiPropertyOptional({ example: 'SPOTIFY' })
	@IsOptional()
	@IsString()
	@MaxLength(50)
	providerCode?: string;

	@ApiPropertyOptional({ example: 'sftp.example.com' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	sftpHost?: string;

	@ApiPropertyOptional({ example: 'username' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	sftpUsername?: string;

	@ApiPropertyOptional({ example: 'ENCRYPTED_TEXT' })
	@IsOptional()
	@IsString()
	sftpPasswordEncrypted?: string;

	@ApiPropertyOptional({ example: '/' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	remotePath?: string;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class GetListDeliveryConfigsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ example: ['spotify', 'direct'], type: [String] })
	@IsOptional()
	@IsIn([undefined], { each: true })
	keyword?: string[];

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional({ example: 1 })
	@IsOptional()
	@IsInt()
	@Min(1)
	id?: number;
}
