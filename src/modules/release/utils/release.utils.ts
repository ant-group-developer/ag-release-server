import { getCoverArtThumbnails } from 'src/utils/util';
import { Release } from '../entities/release.entity';

export function enhanceReleasesDetails(releases: Release[]) {
	return releases.map(enhanceReleaseDetail);
}

export function enhanceReleaseDetail(release: Release) {
	const { releaseCoverArts, ...restOfRelease } = release;

	const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

	return normalizeMetadataExternal({
		...restOfRelease,
		coverArtThumbnails,
	});
}

type MetadataExternalSource = {
	metadataSpotify?: unknown;
	metadataDeezer?: unknown;
	tracks?: MetadataExternalSource[];
	release?: MetadataExternalSource;
};

export function normalizeMetadataExternal<T extends MetadataExternalSource>(
	entity: T,
): T & { metadataExternal: Record<string, unknown> } {
	const target = entity as T & {
		metadataSpotify?: unknown;
		metadataDeezer?: unknown;
		metadataExternal: Record<string, unknown>;
	};

	target.metadataExternal = {
		...(target.metadataSpotify
			? { spotify: omitTrackLinks(target.metadataSpotify) }
			: {}),
		...(target.metadataDeezer
			? { deezer: omitTrackLinks(target.metadataDeezer) }
			: {}),
	};

	delete target.metadataSpotify;
	delete target.metadataDeezer;

	if (target.tracks) {
		target.tracks = target.tracks.map((track) =>
			normalizeMetadataExternal(track),
		);
	}

	if (target.release) {
		target.release = normalizeMetadataExternal(target.release);
	}

	return target;
}

function omitTrackLinks(metadata: unknown): unknown {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return metadata;
	}

	const { trackLinks: _trackLinks, ...rest } = metadata as Record<
		string,
		unknown
	>;

	return rest;
}
