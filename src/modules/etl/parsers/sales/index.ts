export { BaseSalesParser } from './base-sales.parser';
export { WmgSalesParser } from './wmg-sales.parser';
export type { WmgStreamingOpts, WmgStreamingResult } from './wmg-sales.parser';

// Group A: Standard Merlin CSV
export { AudiomackSalesParser, JooxSalesParser, RessoSalesParser, TrebelSalesParser, TencentSalesParser, TaobaoSalesParser, NeteaseSalesParser, SoundtrackSalesParser, KkboxSalesParser } from './group-a-parsers';

// Group B: Custom format
export { AnghamiSalesParser, AwaSalesParser, IheartSalesParser, SoundcloudSalesParser, SaavnSalesParser, RythmSalesParser, MixcloudSalesParser } from './group-b-parsers';

// Group C-E: Complex format
export { DeezerSalesParser, PandoraSalesParser, FacebookSalesParser, SpotifySalesParser, VevoSalesParser, TiktokSalesParser, SnapSalesParser, BoomplaySalesParser } from './group-ce-parsers';

import { BaseSalesParser } from './base-sales.parser';
import { AudiomackSalesParser, JooxSalesParser, RessoSalesParser, TrebelSalesParser, TencentSalesParser, TaobaoSalesParser, NeteaseSalesParser, SoundtrackSalesParser, KkboxSalesParser } from './group-a-parsers';
import { AnghamiSalesParser, AwaSalesParser, IheartSalesParser, SoundcloudSalesParser, SaavnSalesParser, RythmSalesParser, MixcloudSalesParser } from './group-b-parsers';
import { DeezerSalesParser, PandoraSalesParser, FacebookSalesParser, SpotifySalesParser, VevoSalesParser, TiktokSalesParser, SnapSalesParser, BoomplaySalesParser } from './group-ce-parsers';

/**
 * Registry mapping DSP folder name prefixes to their SALES parser classes.
 */
export const SALES_PARSER_REGISTRY: Record<string, () => BaseSalesParser> = {
  'ang': () => new AnghamiSalesParser(),
  'aum': () => new AudiomackSalesParser(),
  'awa': () => new AwaSalesParser(),
  'boo': () => new BoomplaySalesParser(),
  'dzr': () => new DeezerSalesParser(),
  'fbk': () => new FacebookSalesParser(),
  'iht': () => new IheartSalesParser(),
  'joo': () => new JooxSalesParser(),
  'kbx': () => new KkboxSalesParser(),
  'mxc': () => new MixcloudSalesParser(),
  'ncm': () => new NeteaseSalesParser(),
  'pnd': () => new PandoraSalesParser(),
  'res': () => new RessoSalesParser(),
  'rhm': () => new RythmSalesParser(),
  'scu': () => new SoundcloudSalesParser(),
  'snp': () => new SnapSalesParser(),
  'spo': () => new SpotifySalesParser(),
  'stb': () => new SoundtrackSalesParser(),
  'svn': () => new SaavnSalesParser(),
  'tbl': () => new TrebelSalesParser(),
  'tbo': () => new TaobaoSalesParser(),
  'tiktok': () => new TiktokSalesParser(),
  'tme': () => new TencentSalesParser(),
  'vvo': () => new VevoSalesParser(),
};

/**
 * Resolve sales parser from folder name like "aum-audiomack", "tiktok", etc.
 */
export function getSalesParserForFolder(folderName: string): BaseSalesParser | null {
  if (SALES_PARSER_REGISTRY[folderName]) return SALES_PARSER_REGISTRY[folderName]();
  const prefix = folderName.split('-')[0];
  const factory = SALES_PARSER_REGISTRY[prefix];
  return factory ? factory() : null;
}
