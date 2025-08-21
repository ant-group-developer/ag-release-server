export enum BucketGcsAction {
	READ = 'read',
	WRITE = 'write',
}

export enum EntityTypePicture {
	ARTIST = 'artists',
	DSP = 'dsps',
	LABEL = 'labels',
	GENRE = 'genres',
	TRACK = 'tracks',
	TENANT = 'tenants',
	LOGO = 'logo',
}

export enum UploadPurpose {
	TRACK_AUDIO = 'track_audio',
	PEAK_AUDIO = 'peak_audio',
	RELEASE_COVER_ART = 'release_cover_art',
}
