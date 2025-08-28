const ArtistProfileMessageError = {
	DSP_NOT_FOUND: 'artistProfile.message.error.dspNotFound',
	ARTIST_NOT_FOUND: 'artistProfile.message.error.artistNotFound',
};

const ArtistProfileMessageCodeError = {
	DSP_NOT_FOUND: 'Dsp not found',
	ARTIST_NOT_FOUND: 'Artist not found',
};

export const ArtistProfileMessage = {
	DSP_NOT_FOUND: {
		message: ArtistProfileMessageError.DSP_NOT_FOUND,
		messageCode: ArtistProfileMessageCodeError.DSP_NOT_FOUND,
	},
	ARTIST_NOT_FOUND: {
		message: ArtistProfileMessageError.ARTIST_NOT_FOUND,
		messageCode: ArtistProfileMessageCodeError.ARTIST_NOT_FOUND,
	},
};
