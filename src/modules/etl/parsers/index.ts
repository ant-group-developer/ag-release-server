import { BaseParser } from './base.parser';
import { AudiomackParser } from './trends-usage/audiomack.parser';
import { AwaParser } from './trends-usage/awa.parser';
import { BoomplayParser } from './trends-usage/boomplay.parser';
import { DeezerParser } from './trends-usage/deezer.parser';
import { FacebookParser } from './trends-usage/facebook.parser';
import { NeteaseParser } from './trends-usage/netease.parser';
import { SnapParser } from './trends-usage/snap.parser';
import { SoundCloudParser } from './trends-usage/soundcloud.parser';
import { SpotifyParser } from './trends-usage/spotify.parser';
import { TencentParser } from './trends-usage/tencent.parser';
import { TiktokParser } from './trends-usage/tiktok.parser';
import { UmaParser } from './trends-usage/uma.parser';
import { VevoParser } from './trends-usage/vevo.parser';

/**
 * Registry mapping DSP folder name prefixes to their parser classes.
 * Supports both prefix-based (e.g. "aum-audiomack") and exact name (e.g. "tiktok").
 */
export const PARSER_REGISTRY: Record<string, () => BaseParser> = {
	aum: () => new AudiomackParser(),
	awa: () => new AwaParser(),
	boo: () => new BoomplayParser(),
	dzr: () => new DeezerParser(),
	fbk: () => new FacebookParser(),
	ncm: () => new NeteaseParser(),
	snp: () => new SnapParser(),
	scu: () => new SoundCloudParser(),
	spo: () => new SpotifyParser(),
	tme: () => new TencentParser(),
	tiktok: () => new TiktokParser(),
	uma: () => new UmaParser(),
	vvo: () => new VevoParser(),
};

/**
 * Resolve parser from folder name like "aum-audiomack", "spo-spotify", "tiktok", etc.
 */
export function getParserForFolder(folderName: string): BaseParser | null {
	// Try exact match first (e.g. "tiktok")
	if (PARSER_REGISTRY[folderName]) {
		return PARSER_REGISTRY[folderName]();
	}
	// Then try prefix before first dash (e.g. "aum" from "aum-audiomack")
	const prefix = folderName.split('-')[0];
	const factory = PARSER_REGISTRY[prefix];
	return factory ? factory() : null;
}

export { BaseParser } from './base.parser';
