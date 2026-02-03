import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { DistributionType } from '../enum/release-dsp.enum';

export class UpdateReleaseTerritoryDto {
	@IsOptional()
	@IsBoolean()
	distributeWorldwide: boolean | null;

	@IsOptional()
	@IsEnum(DistributionType)
	distributionType?: DistributionType | null;

	@IsArray()
	@IsOptional()
	selectedCountries?: string[] | null;
}
