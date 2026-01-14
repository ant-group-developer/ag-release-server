// aggregator.dto.ts
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_EMAIL,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

export class CreateAggregatorDto {
	@ApiProperty({ example: 'merlin' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@ApiProperty({ example: 'Merlin Network' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@ApiProperty({ example: 'tech@merlin.org', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_EMAIL)
	contactEmail?: string;
}

export class UpdateAggregatorDto extends PartialType(CreateAggregatorDto) {}

export class GetListAggregatorsDto extends BaseQueryDto2 {}
