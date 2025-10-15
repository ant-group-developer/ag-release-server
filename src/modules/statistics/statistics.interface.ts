export interface IRevenueDspTimeline {
	date: string;
	totalRevenue: number;
	totalRecords: number;
	detail: IRevenueDspDetail[];
}

export interface IRevenueDspDetail {
	dspId: string;
	dspName: string;
	totalRevenue: number;
	totalRecords: number;
}

export interface DspDetail {
	dspId: number;
	dspName: string;
	totalRevenue: number;
	totalRecords: number;
}
