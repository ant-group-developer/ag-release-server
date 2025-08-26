import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
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
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderRelease, ReleaseStatus } from '../enum/release.enum';

export class CreateReleaseDto {
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
}

export class SubmitCreateReleaseDto extends CreateReleaseDto {
	@IsOptional()
	@ValidateIf((_, value) => value !== undefined)
	@IsIn([ReleaseStatus.DRAFT])
	status: ReleaseStatus.DRAFT;
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
}

export class QueryGetListReleaseDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	title?: string;

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
}
