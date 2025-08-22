// src/config/dto/auth0-config.dto.ts
import { Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { ReleaseStatus } from '../../release/enum/release.enum';
import { ExecuteCycleType } from '../enums/app-config.enum';

export class UpdateAuth0ConfigDto {
	@IsString() clientId: string;
	@IsString() clientSecret: string;
	@IsString() domain: string;
	@IsString() audience: string;
	@IsString() connectionName: string;
	@IsString() timeSyncData: string;
}

export class UpdateWebsiteConfigDto {
	@IsString() name: string;

	@IsString()
	@IsOptional()
	logo: string | null;

	@IsString() title: string;

	@IsString() description: string;
}

export class UpdateTelegramDto {
	@IsString() token: string;
	@IsString() chatId: string;
}

export class UpdateAcrCloudDto {
	@IsString() acrHost: string;
	@IsString() acrAccessKey: string;
	@IsString() acrAccessSecret: string;

	@IsNumber()
	@Min(1)
	@Max(12)
	chunkDuration: number;

	@IsNumber()
	@Min(1)
	@Max(100)
	scoreWarning: number;

	@IsBoolean()
	autoScan: boolean;

	@IsString()
	autoScanTime: string;

	@IsArray()
	@IsEnum(ReleaseStatus, { each: true })
	releaseStatusAutoScans: ReleaseStatus[];
}

export class ExecuteConfigDto {
	@IsOptional()
	@IsNumber()
	nDays?: number;

	@IsOptional()
	@IsNumber()
	nHours?: number;

	@IsOptional()
	@IsNumber()
	nMinutes?: number;

	@IsOptional()
	@IsString()
	dayOfWeek?: string;

	@IsOptional()
	@IsNumber()
	dayOfMonth?: number;

	@IsOptional()
	@IsString()
	time?: string;
}

export class UpdateBackupDatabaseDto {
	@IsEnum(ExecuteCycleType)
	executeCycleType: ExecuteCycleType;

	@ValidateNested()
	@Type(() => ExecuteConfigDto)
	executeConfig: ExecuteConfigDto;

	@IsBoolean()
	notifyOnFailed: boolean;

	@IsBoolean()
	notifyOnSuccess: boolean;

	@IsBoolean()
	toDrive: boolean;

	@IsBoolean()
	toGcs: boolean;
}

export class UpdateConfigDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateAuth0ConfigDto)
	auth0?: UpdateAuth0ConfigDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateWebsiteConfigDto)
	website?: UpdateWebsiteConfigDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateTelegramDto)
	telegram?: UpdateTelegramDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateAcrCloudDto)
	acrCloud?: UpdateAcrCloudDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateBackupDatabaseDto)
	backupDatabase?: UpdateBackupDatabaseDto;
}
