import { getCoverArtThumbnails } from 'src/utils/util';
import { Release } from '../entities/release.entity';

export function enhanceReleasesDetails(releases: Release[]) {
	return releases.map(enhanceReleaseDetail);
}

export function enhanceReleaseDetail(release: Release) {
	const { releaseCoverArts, ...restOfRelease } = release;

	const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

	return {
		...restOfRelease,
		coverArtThumbnails,
	};
}
