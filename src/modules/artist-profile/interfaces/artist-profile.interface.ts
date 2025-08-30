import { IAuditDto } from 'src/common/interface/common.interface';

export interface ICreateArtistProfile extends IAuditDto {
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
