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
	VIDEO_FILE = 'video_file',
	VIDEO_CAPTION = 'video_caption',

	// metadata
	release_metadata_ci = 'release_metadata_ci',
	release_metadata_spotify = 'release_metadata_spotify',
	release_template_file = 'release_template_file',

	template_export_ci = 'template_export_ci',
}

export enum Type {
	READ = 'read',
	WRITE = 'write',
}

// export enum StorageProvider {
// 	GCS = 'gcs',
// 	// MINIO = 'minio',
// 	R2 = 'r2',
// }
