// aggregator.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_EMAIL,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { AggregatorFieldOrder } from '../enum/enum';
import { CreateDistributionChannelDto } from './distribution-channel.dto';

export class CreateAggregatorDto {
	@ApiProperty({
		description: 'Mã aggregator (duy nhất)',
		example: 'merlin',
		maxLength: DEFAULT_LENGTH_CODE,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@ApiProperty({
		description: 'Tên aggregator',
		example: 'Merlin Network',
		maxLength: DEFAULT_LENGTH_NAME,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@ApiPropertyOptional({
		description: 'Email liên hệ',
		example: 'tech@merlin.org',
		maxLength: DEFAULT_LENGTH_EMAIL,
	})
	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_EMAIL)
	contactEmail?: string;

	@ApiPropertyOptional({
		description: 'Danh sách distribution channels',
		type: () => CreateDistributionChannelDto,
		isArray: true,
	})
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateDistributionChannelDto)
	distributionChannels?: CreateDistributionChannelDto[];
}

export class UpdateAggregatorDto extends PartialType(CreateAggregatorDto) {}

export class GetListAggregatorsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		description: 'Từ khóa tìm kiếm',
		example: 'merlin',
	})
	search?: string;

	@IsOptional()
	@IsEnum(AggregatorFieldOrder)
	fieldOrder: AggregatorFieldOrder = AggregatorFieldOrder.name;
}
