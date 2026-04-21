import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GetEmailsDto {
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	limit?: number;

	@IsOptional()
	@IsString()
	since?: string;

	@IsOptional()
	@IsString()
	until?: string;

	@IsOptional()
	@IsString()
	status?: string;

	@IsOptional()
	@IsString()
	campaign_id?: string;
}
