import { UploadPurpose } from '../enum/bucket.enum';

export const folderMap: Record<UploadPurpose, string> = {
	[UploadPurpose.TRACK_AUDIO]: 'tracks',
	[UploadPurpose.PEAK_AUDIO]: 'tracks',
	[UploadPurpose.RELEASE_COVER_ART]: 'release_cover_art',
};
