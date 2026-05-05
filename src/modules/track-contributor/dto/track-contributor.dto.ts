import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateTrackContributorDto {
	@ApiProperty({ format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	artistRoleId: string;

	@ApiProperty({ minLength: 10, maxLength: 10 })
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	artistId: string;

	@ApiProperty({ minLength: 10, maxLength: 10 })
	@IsNotEmpty()
	@Length(10, 10)
	trackId: string;
}

export class BulkCreateTrackContributorDto {
	@ApiProperty({ type: [CreateTrackContributorDto] })
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateTrackContributorDto)
	items: CreateTrackContributorDto[];
}

export class UpdateTrackContributorDto extends PartialType(
	CreateTrackContributorDto,
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
	trackId: string;
}

export class QueryGetListTrackContributorDto extends BaseQueryDto {
	@ApiProperty({ minLength: 10, maxLength: 10, required: false })
	@Length(10, 10)
	@IsOptional()
	trackId?: string;
}
