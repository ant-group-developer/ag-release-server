import { EntityTypePicture, UploadPurpose } from '../enum/bucket.enum';

export const FolderBucketMap: Record<
	EntityTypePicture | UploadPurpose,
	string
> = {
	// public
	[EntityTypePicture.ARTIST]: 'artists',
	[EntityTypePicture.DSP]: 'dsps',
	[EntityTypePicture.LABEL]: 'labels',
	[EntityTypePicture.GENRE]: 'genres',
	[EntityTypePicture.TRACK]: 'tracks',
	[EntityTypePicture.TENANT]: 'tenants',
	[EntityTypePicture.LOGO]: 'logo',
	[EntityTypePicture.TRACK_SENSITIVE]: 'track_sensitive',
	[EntityTypePicture.NEWS_POST_THUMBNAIL]: 'news_post/thumbnail',
	[EntityTypePicture.NEWS_POST_CONTENT]: 'news_post/content',

	// private
	[UploadPurpose.TRACK_AUDIO]: 'tracks',
	[UploadPurpose.PEAK_AUDIO]: 'tracks',
	[UploadPurpose.RELEASE_COVER_ART]: 'release_cover_art',
	[UploadPurpose.release_metadata_ci]: 'release_metadata_ci',
	[UploadPurpose.release_metadata_spotify]: 'release_metadata_spotify',
	[UploadPurpose.release_template_file]: 'release_template_file',
};
