export interface ICreateArtistProfile {
	name: string;
	url: string;
	dspId: string;
	artistId: string;
}

export interface IBulkUpdateArtistProfile {
	id: string;
	name?: string;
	url?: string;
	dspId?: string;
	artistId?: string;
}

export interface IUpdateArtistProfile {
	name?: string;
	url?: string;
	dspId?: string;
	artistId?: string;
}
