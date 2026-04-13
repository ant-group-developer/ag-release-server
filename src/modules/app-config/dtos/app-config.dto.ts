// src/config/dto/auth0-config.dto.ts
import { Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { ReleaseStatus } from '../../release/enum/release.enum';

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

export class UpdateBackupDatabaseDto {
	@IsBoolean()
	enable: boolean;

	@IsNotEmpty()
	@IsString()
	cronValue: string;

	@IsString()
	@IsNotEmpty()
	fileName: string;

	@IsString()
	@IsNotEmpty()
	shell: string;

	@IsBoolean()
	notifyOnFailed: boolean;

	@IsBoolean()
	notifyOnSuccess: boolean;

	@IsBoolean()
	toDrive: boolean;

	@IsBoolean()
	toGcs: boolean;

	@IsBoolean()
	toR2: boolean;
}

export class UpdateTrackConfigDto {
	@IsNumber()
	sampleLength: number;

	@IsNumber()
	preview: number;
}

export class UpdateGeneratorDto {
	@IsOptional()
	// @IsNotEmpty()
	prefixUpcDefaultId: string;

	@IsOptional()
	// @IsNotEmpty()
	prefixIsrcDefaultId: string;

	@IsOptional()
	// @IsNotEmpty()
	DDEX_PARTY_ID_AMG: string;

	@IsOptional()
	// @IsNotEmpty()
	DDEX_PARTY_NAME_AMG: string;

	@IsOptional()
	// @IsNotEmpty()
	API_KEY_GRPC_ISRC_UPC: string;
}

export class UpdateOtherAppconfigDto {
	@IsOptional()
	fileCiTemplateId?: string | null;

	@IsOptional()
	excelDataStartRow?: number | null;
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

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateTrackConfigDto)
	general?: UpdateTrackConfigDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateGeneratorDto)
	generator?: UpdateGeneratorDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateOtherAppconfigDto)
	other?: UpdateOtherAppconfigDto;
}
