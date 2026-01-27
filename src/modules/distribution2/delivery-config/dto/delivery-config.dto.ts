// src/modules/distribution/delivery-config/dto/delivery-config.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

export class UpsertDeliveryConfigDto {
	@IsOptional()
	@IsUUID()
	id?: string;

	@ApiProperty({ example: 'Spotify Direct' })
	@IsString()
	@MaxLength(255)
	name: string;

	@IsString()
	host: string;

	@IsNumber()
	port: number;

	@IsString()
	username: string;

	@IsString()
	password: string;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class CreateDeliveryConfigDto {
	@ApiProperty({ example: 'Spotify Direct' })
	@IsString()
	@MaxLength(255)
	name: string;

	@IsString()
	host: string;

	@IsNumber()
	port: number;

	@IsString()
	username: string;

	@IsString()
	password: string;

	// @ApiPropertyOptional({
	// 	example: 'SPOTIFY',
	// 	description: 'SPOTIFY | CI | MERLIN | ...',
	// })
	// @IsOptional()
	// @IsString()
	// @MaxLength(50)
	// providerCode?: string;

	// @ApiProperty({ example: 'sftp.example.com' })
	// @IsString()
	// @MaxLength(255)
	// sftpHost: string;

	// @ApiProperty({ example: 'username' })
	// @IsString()
	// @MaxLength(255)
	// sftpUsername: string;

	// @ApiPropertyOptional({ example: 'ENCRYPTED_TEXT' })
	// @IsOptional()
	// @IsString()
	// sftpPasswordEncrypted?: string;

	// @ApiPropertyOptional({ example: '/', default: '/' })
	// @IsOptional()
	// @IsString()
	// @MaxLength(255)
	// remotePath?: string;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class UpdateDeliveryConfigDto extends PartialType(
	CreateDeliveryConfigDto,
) {}

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
