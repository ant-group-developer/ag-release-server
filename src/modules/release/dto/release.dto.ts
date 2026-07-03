import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsDate,
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Max,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderRelease, ReleaseStatus } from '../enum/release.enum';

export class CreateReleaseDto {
	@IsOptional()
	@IsString()
	type?: 'audio' | 'video';

	@ApiProperty({ example: 'Autumn Without You', maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	title: string;

	@IsNotEmpty()
	@Length(10, 10)
	albumFormatId: string;

	@ApiProperty({
		example: 'Original Version',
		maxLength: 150,
		required: false,
	})
	@IsOptional()
	@IsString()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	@MaxLength(150)
	version: string | null;

	@ApiProperty({ example: '893123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	upc: string | null;

	@ApiProperty({ example: 'JzCTrtvkEn' })
	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	primaryGenreId: string;

	@ApiProperty({ example: 'JzCTrtvkEn', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	subGenreId: string | null;

	@ApiProperty({ example: 'Zz2jDwRg6T' })
	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	labelId: string;

	@ApiProperty({ enum: ReleaseStatus, example: ReleaseStatus.DRAFT })
	@IsEnum(ReleaseStatus)
	status: ReleaseStatus;

	@ApiProperty({ example: 2025 })
	@IsNumber()
	@IsNotEmpty()
	@Min(1000)
	@Max(9999)
	cLineYear: number;

	@ApiProperty({ example: 'Exclusive Licensed AMG' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	cLineOwner: string;

	@ApiProperty({ example: 2025 })
	@IsNumber()
	@IsNotEmpty()
	@Min(1000)
	@Max(9999)
	pLineYear: number;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	pLineOwner: string;

	@ApiProperty({ example: 'A1234' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	catalogId: string | null;

	@ApiProperty({ example: '2025-07-01' })
	@IsNotEmpty()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseDate: Date;

	@ApiProperty({ example: '2025-12-31', required: false })
	@IsOptional()
	@Transform(({ value }: { value: string | null | undefined }) =>
		value ? new Date(value) : value,
	)
	@IsDate()
	releaseEndDate?: Date | null;

	@ApiProperty({ example: '18:00' })
	@IsOptional()
	@IsString()
	@MaxLength(10)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	releaseTime: string;

	@ApiProperty({
		example: '2c9bcd45-4f34-4e98-8ba6-3d5bcbcd11b1',
		required: false,
	})
	@IsOptional()
	@IsUUID()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	releaseTimezoneId: string | null;

	@IsOptional()
	@IsUUID()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	priceTierId?: string | null;

	@ApiProperty({ example: false, required: false, default: false })
	@IsOptional()
	@IsBoolean()
	isInstrumental?: boolean;
}

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	albumFormatId?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	@ValidateIf((_, value) => value !== undefined)
	title: string;

	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	primaryGenreId: string;

	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	labelId: string;

	@IsEnum(ReleaseStatus)
	@ValidateIf((_, value) => value !== undefined)
	status: ReleaseStatus;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	cLineOwner?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	pLineOwner?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseDate?: Date;

	@ValidateIf((_, value) => value !== undefined)
	@IsOptional()
	@Transform(({ value }: { value: string | null | undefined }) =>
		value ? new Date(value) : value,
	)
	@IsDate()
	releaseEndDate?: Date | null;

	@IsOptional()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	priceTierId?: string | null;
}

export class ReloadReleaseFormatIdDto {
	@ApiPropertyOptional({
		type: Boolean,
		description: 'Reload release format ID from CI',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	reloadFromCi?: boolean;
}

export class QueryGetListReleaseDto extends BaseQueryDto {
	@ApiPropertyOptional({
		type: [String],
		description: 'Release IDs',
		example: ['550e8400-e29b-41d4-a716-446655440000'],
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	@IsArray()
	ids?: string[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Include release IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	@IsArray()
	idInclude?: string[];

	@ApiPropertyOptional({
		description: 'Release title',
		example: 'My Album',
	})
	@IsOptional()
	@IsString()
	title?: string;

	@ApiPropertyOptional({
		enum: ['audio', 'video'],
		description: 'Release content type',
	})
	@IsOptional()
	@IsIn(['audio', 'video'])
	type?: 'audio' | 'video';

	@ApiPropertyOptional({
		enum: FieldOrderRelease,
		default: FieldOrderRelease.TITLE,
	})
	@IsEnum(FieldOrderRelease)
	fieldOrder: FieldOrderRelease = FieldOrderRelease.TITLE;

	@ApiPropertyOptional({
		type: [String],
		description: 'Album format IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	albumFormatId?: string[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Primary genre IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	primaryGenreId?: string[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Sub genre IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	subGenreId?: string[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Label IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	labelId?: string[];

	@ApiPropertyOptional({
		type: [String],
		description: 'Artist IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	artistId?: string[];

	@ApiPropertyOptional({
		type: String,
		format: 'date-time',
		description: 'Start release date',
	})
	@IsOptional()
	startDateRelease?: Date;

	@ApiPropertyOptional({
		type: String,
		format: 'date-time',
		description: 'End release date',
	})
	@IsOptional()
	endDateRelease?: Date;

	@ApiPropertyOptional({
		enum: ReleaseStatus,
		isArray: true,
		description: 'Release statuses',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(ReleaseStatus, { each: true })
	status?: ReleaseStatus[];

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Is various artist release',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isVariousArtist?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Whether the release was imported from a report',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isImportedFromReport?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Whether the release has been successfully enriched',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isEnrich?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Có lỗi đang mở hay không',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	hasError?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Có đang cần review hay không',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	needsReview?: boolean;

	@ApiPropertyOptional({
		type: [String],
		description: 'Tenant IDs',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	tenantIds?: string[];
}

export class QueryGetListReleaseDto2 extends BaseQueryDto {
	// or
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	@IsArray()
	releaseIdsInclude?: string[];

	// and
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	@IsArray()
	releaseIds?: string[];

	@IsOptional()
	@IsString()
	title?: string;

	@IsOptional()
	@IsIn(['audio', 'video'])
	type?: 'audio' | 'video';

	@IsEnum(FieldOrderRelease)
	fieldOrder: FieldOrderRelease = FieldOrderRelease.TITLE;

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	albumFormatId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	primaryGenreId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	subGenreId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	labelId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	artistId?: string[];

	@IsOptional()
	// @IsDate()
	startDateRelease?: Date;

	@IsOptional()
	// @IsDate()
	endDateRelease?: Date;

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(ReleaseStatus, { each: true })
	status?: ReleaseStatus[];

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isVariousArtist?: boolean;

	tenantIds?: string[];
}

export class FileExportReleaseCiDto {
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	ids: string[];

	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	dspCodeCi: string[];
}

export class BulkSubmitReleaseDto {
	@ApiProperty({ type: [String], format: 'uuid' })
	@IsUUID('4', { each: true })
	ids: string[];

	@ApiProperty({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsUUID('4', { each: true })
	idsExclude?: string[];

	@ApiProperty({ type: [String] })
	@IsString({ each: true })
	codes: string[];
}

export class AutoSubmitUndistributedMusicReleaseDto {
	@ApiProperty({
		description: 'Danh sách DSP code cần kiểm tra và submit lại',
		example: ['SPOTIFY', 'APPLE_MUSIC'],
		type: [String],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	dspCodes: string[];
}
