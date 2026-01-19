import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

// Create
export class CreateDealTypeDto {
	@IsString()
	code: string;

	@IsString()
	name: string;

	@IsBoolean()
	requiresConnection: boolean;
}

// Update
export class UpdateDealTypeDto {
	@IsOptional()
	@IsString()
	code?: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsBoolean()
	requiresConnection?: boolean;
}

// List filter (theo style keyword[] + paging)
export class GetListDealTypesDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsString({ each: true })
	keyword?: string[];
}
