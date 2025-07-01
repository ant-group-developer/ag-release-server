import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
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
}

export class QueryGetListReleaseDto extends BaseQueryDto {}
