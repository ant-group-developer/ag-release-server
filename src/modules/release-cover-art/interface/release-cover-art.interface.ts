export interface ICreateReleaseCoverArt {
	releaseId: string;
	fileId: string;
	width: number;
	height: number;
	type: string;
}

export interface IUpdateReleaseCoverArt {
	id: string;
	fileId: string;
	width: number;
	height: number;
	type: string;
}
