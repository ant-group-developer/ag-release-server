import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsDate,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { ReleaseStatus, ReleaseType } from '../enum/release.enum';

export class CreateReleaseDto {
	@ApiProperty({ example: 'Autumn Without You', maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	title: string;

	@ApiProperty({
		example: 'Original Version',
		maxLength: 150,
		required: false,
	})
	@IsOptional()
	@IsString()
	@MaxLength(150)
	version?: string | null;

	@ApiProperty({ example: '893123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	upc?: string | null;

	@ApiProperty({ example: 'JzCTrtvkEn' })
	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	primaryGenreId: string;

	@ApiProperty({ example: 'JzCTrtvkEn', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	subGenreId?: string | null;

	@ApiProperty({ example: 'Zz2jDwRg6T' })
	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	labelId: string;

	@ApiProperty({ enum: ReleaseStatus, example: ReleaseStatus.DRAFT })
	@IsEnum(ReleaseStatus)
	status: ReleaseStatus;

	@ApiProperty({ enum: ReleaseType, example: ReleaseType.SINGLE })
	@IsEnum(ReleaseType)
	type: ReleaseType;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	cLineOwner: string;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	pLineOwner: string;

	@ApiProperty({ example: 'A1234' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	catalogId: string;

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
	releaseTime: string;

	@ApiProperty({
		example: '2c9bcd45-4f34-4e98-8ba6-3d5bcbcd11b1',
		required: false,
	})
	@IsOptional()
	@IsUUID()
	releaseTimezoneId?: string | null;
}

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
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

	@IsEnum(ReleaseType)
	@ValidateIf((_, value) => value !== undefined)
	type: ReleaseType;

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

export class QueryGetListReleaseDto extends BaseQueryDto {}
