import { DistributionType } from '../enum/release-dsp.enum';

export interface ICreateReleaseTerritory {
	releaseId: string;
	distributeWorldwide?: boolean | null;
	distributionType?: DistributionType | null;
	selectedCountries?: string[] | null;
}

export interface IUpdateReleaseTerritory {
	distributeWorldwide?: boolean | null;
	distributionType?: DistributionType | null;
	selectedCountries?: string[] | null;
}
