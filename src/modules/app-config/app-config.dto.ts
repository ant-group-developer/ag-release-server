// src/config/dto/auth0-config.dto.ts
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

export class Auth0ConfigDto {
	@IsString() clientId: string;
	@IsString() clientSecret: string;
	@IsString() domain: string;
	@IsString() audience: string;
	@IsString() connectionName: string;
	@IsString() timeSyncData: string;
}

export class WebsiteConfigDto {
	@IsString() name: string;
	@IsString() logo: string;
	@IsString() title: string;
	@IsString() description: string;
	@IsString() timeBackupDatabase: string;
}

export class UpdateConfigDto {
	@ValidateNested()
	@Type(() => Auth0ConfigDto)
	auth0: Auth0ConfigDto;

	@ValidateNested()
	@Type(() => WebsiteConfigDto)
	website: WebsiteConfigDto;
}
