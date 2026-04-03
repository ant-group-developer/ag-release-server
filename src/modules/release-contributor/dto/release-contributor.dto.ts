import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateReleaseContributorDto {
	@ApiProperty({ format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	artistRoleId: string;

	@ApiProperty({ minLength: 10, maxLength: 10 })
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	artistId: string;

	@ApiProperty({ format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	releaseId: string;

	@ApiProperty({ default: false })
	@IsBoolean()
	@IsNotEmpty()
	addContributorToTracks: boolean;
}

export class UpdateReleaseContributorDto extends PartialType(
	CreateReleaseContributorDto,
) {
	@ApiProperty({ format: 'uuid', required: false })
	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	artistRoleId: string;

	@ApiProperty({ minLength: 10, maxLength: 10, required: false })
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	artistId: string;

	@ApiProperty({ format: 'uuid', required: false })
	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	releaseId: string;

	@ApiProperty({ required: false })
	@IsBoolean()
	@IsOptional()
	addContributorToTracks?: boolean;
}

export class QueryGetListReleaseContributorDto extends BaseQueryDto {}

export class BulkCreateReleaseContributorDto {
	@ApiProperty({ type: [CreateReleaseContributorDto] })
	@IsArray()
	@IsNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => CreateReleaseContributorDto)
	items: CreateReleaseContributorDto[];
}
