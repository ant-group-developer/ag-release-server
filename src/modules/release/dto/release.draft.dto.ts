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
import { ReleaseType } from '../enum/release.enum';

export class CreateReleaseDraftDto {
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
	@IsOptional()
	@Length(10, 10)
	primaryGenreId?: string | null;

	@ApiProperty({ example: 'JzCTrtvkEn', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	subGenreId?: string | null;

	@ApiProperty({ example: 'Zz2jDwRg6T' })
	@IsString()
	@IsOptional()
	@Length(10, 10)
	labelId?: string | null;

	@ApiProperty({ enum: ReleaseType, example: ReleaseType.SINGLE })
	@IsEnum(ReleaseType)
	type: ReleaseType;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG' })
	@IsString()
	@IsOptional()
	@MaxLength(200)
	cLineOwner?: string | null;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG' })
	@IsString()
	@IsOptional()
	@MaxLength(200)
	pLineOwner: string | null;

	@ApiProperty({ example: 'A1234' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	catalogId?: string | null;

	@ApiProperty({ example: '2025-07-01' })
	@IsOptional()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseDate?: Date | null;

	@ApiProperty({ example: '18:00' })
	@IsOptional()
	@IsString()
	@MaxLength(10)
	releaseTime?: string | null;

	@ApiProperty({
		example: '2c9bcd45-4f34-4e98-8ba6-3d5bcbcd11b1',
		required: false,
	})
	@IsOptional()
	@IsUUID()
	releaseTimezoneId?: string | null;
}

export class UpdateReleaseDraftDto extends PartialType(CreateReleaseDraftDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	@ValidateIf((_, value) => value !== undefined)
	title?: string;

	@IsEnum(ReleaseType)
	@ValidateIf((_, value) => value !== undefined)
	type?: ReleaseType;

	@IsString()
	@IsOptional()
	@Length(10, 10)
	primaryGenreId?: string | null;

	@IsString()
	@IsOptional()
	@Length(10, 10)
	labelId?: string | null;

	@IsString()
	@IsOptional()
	@MaxLength(200)
	cLineOwner?: string | null;

	@IsString()
	@IsOptional()
	@MaxLength(200)
	pLineOwner?: string | null;

	@IsOptional()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseDate?: Date | null;
}
