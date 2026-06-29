import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { DomainSetupMode } from '../entities/tenant-domain.entity';

export class AddDomainDto {
	@ApiProperty({ example: 'release.betamusic.net', description: 'Custom domain (without http/https)' })
	@IsString()
	@IsNotEmpty()
	@Length(4, 253)
	@Matches(/^[^/]+$/, { message: 'Domain must not contain slashes' })
	domain: string;
}

export class GetCfOAuthUrlDto {
	@ApiProperty({ example: 'release.betamusic.net' })
	@IsString()
	@IsNotEmpty()
	domain: string;
}

export class CfOAuthCallbackDto {
	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	code?: string;

	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	error?: string;

	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	error_description?: string;

	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	state: string;
}
