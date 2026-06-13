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

export class CreateVideoContributorDto {
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
	videoId: string;
}

export class BulkCreateVideoContributorDto {
	@ApiProperty({ type: [CreateVideoContributorDto] })
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateVideoContributorDto)
	items: CreateVideoContributorDto[];
}

export class UpdateVideoContributorDto extends PartialType(
	CreateVideoContributorDto,
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
	videoId: string;
}

export class QueryGetListVideoContributorDto extends BaseQueryDto {
	@ApiProperty({ format: 'uuid', required: false })
	@IsUUID()
	@IsOptional()
	videoId?: string;
}
