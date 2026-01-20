import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

// Create
export class CreateDealTypeDto {
	@ApiProperty({
		example: 'DSP',
		description: 'Deal type code',
	})
	@IsString()
	code: string;

	@ApiProperty({
		example: 'DSP Deal',
		description: 'Deal type name',
	})
	@IsString()
	name: string;

	@ApiProperty({
		example: true,
		description: 'Whether deal type requires connection',
	})
	@IsBoolean()
	requiresConnection: boolean;
}
// Update
export class UpdateDealTypeDto {
	@ApiPropertyOptional({ example: 'DSP' })
	@IsOptional()
	@IsString()
	code?: string;

	@ApiPropertyOptional({ example: 'DSP Deal' })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	requiresConnection?: boolean;
}

// List filter (theo style keyword[] + paging)
export class GetListDealTypesDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		type: [String],
		isArray: true,
		example: ['dsp', 'deal'],
		description: 'List of keywords for filtering',
	})
	@IsOptional()
	@IsString({ each: true })
	keyword?: string[];
}
