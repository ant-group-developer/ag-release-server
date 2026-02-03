import { ArtistSource } from '../enum/artist.enum';

export interface ICreateArtist {
	name: string;
	picture?: string | null;
	biography?: string | null;
	creatorId?: string;
	modifierId?: string;

	artistSource?: ArtistSource;
	idSource?: string;
}
