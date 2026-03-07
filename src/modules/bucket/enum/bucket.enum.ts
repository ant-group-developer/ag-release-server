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
	TRACK_SENSITIVE = 'track_sensitive',
	NEWS_POST_THUMBNAIL = 'news_post_thumbnail',
	NEWS_POST_CONTENT = 'news_post_content',
}

export enum UploadPurpose {
	TRACK_AUDIO = 'track_audio',
	PEAK_AUDIO = 'peak_audio',
	RELEASE_COVER_ART = 'release_cover_art',

	// metadata
	release_metadata_ci = 'release_metadata_ci',
	release_metadata_spotify = 'release_metadata_spotify',
	release_template_file = 'release_template_file',
}
