import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from '../../../clickhouse/clickhouse.service';

export interface CanonicalFile {
	localPath: string;
	canonicalName: string;
	dspFolderName: string;
	period: string; // YYYYMM
	isAutoRevision: boolean;
	skipReason?: string;
}

export interface ResolveResult {
	toImport: CanonicalFile[];
	skipped: CanonicalFile[];
}

// Bombshelter standard file pattern
// e.g. bombshelter-digital-services-llc_anghami_202601_Monthly-Sales.csv
// e.g. bombshelter-digital-services-llc_anghami_202601_Monthly-Sales [1].csv
// e.g. bombshelter-digital-services-llc_anghami_202601_Monthly-Sales-auto.csv
// e.g. bombshelter-digital-services-llc_boomplay_202108_Monthly-Sales_TERR1.txt
const BOMBSHELTER_RE =
	/^bombshelter-digital-services-llc_([^_]+)_(\d{6})_(.+?)(\s\[(\d+)\])?(-(auto))?\.(csv|txt|tsv|zip)$/i;

// Revelator ZIP pattern
// e.g. 145958-2025-august-revelator-statement.csv.zip
// e.g. 145958-2025-august-revelator-youtube-statement.csv.zip
const REVELATOR_RE =
	/^(\d+)-(\d{4})-([a-z]+)-revelator(-[a-z]+)?-statement\.csv(?:\.zip)?$/i;

// Month name → MM
const MONTH_MAP: Record<string, string> = {
	january: '01', february: '02', march: '03', april: '04',
	may: '05', june: '06', july: '07', august: '08',
	september: '09', october: '10', november: '11', december: '12',
};

// DSP name from filename → folder prefix used by parsers
const DSP_FOLDER_MAP: Record<string, string> = {
	anghami: 'ang-anghami',
	audiomack: 'aum-audiomack',
	awa: 'awa-awa',
	boomplay: 'boo-boomplay',
	deezer: 'dzr-deezer',
	facebook: 'fbk-facebook',
	'facebook-al-production': 'fbk-facebook',
	'facebook-ugc-consumption': 'fbk-facebook',
	'facebook-ugc-production': 'fbk-facebook',
	iheart: 'iht-iheart',
	joox: 'joo-joox',
	kkbox: 'kbx-kkbox',
	kkboxhk: 'kbx-kkbox',
	kkboxjp: 'kbx-kkbox',
	pandora: 'pnd-pandora',
	resso: 'res-resso',
	soundcloud: 'scu-soundcloud',
	spotify: 'spo-spotify',
	tencent: 'tme-tencent',
	tiktok: 'tiktok',
	trebel: 'tbl-trebel',
	vevo: 'vvo-vevo',
	revelator: 'rev-revelator',
	uma: 'uma-uma',
	mixcloud: 'mxc-mixcloud',
	saavn: 'svn-saavn',
	rhyme: 'rhm-rhyme',
	// Taobao / Alibaba variants
	alibaba: 'tbo-taobao',
	'alibaba-taobao': 'tbo-taobao',
	taobao: 'tbo-taobao',
	// NetEase
	netease: 'ncm-netease',
	// Snap
	snap: 'snp-snap',
	// Soundtrack Your Brand
	'soundtrack-your-brand': 'stb-soundtrack',
	soundtrack: 'stb-soundtrack',
	// Yandex (no parser yet — map to skip gracefully via missing parser)
	yandex: 'ynd-yandex',
	// Rythm
	rythm: 'rhm-rythm',
};

// Supported data file extensions (for non-zip files)
const DATA_EXTS = new Set(['.csv', '.txt', '.tsv']);

@Injectable()
export class StatementsResolverService {
	private readonly logger = new Logger(StatementsResolverService.name);

	constructor(private readonly clickHouseService: ClickHouseService) {}

	/**
	 * Full resolve: returns files to import and files skipped (deduped against FTP history).
	 */
	async resolve(dir: string): Promise<ResolveResult> {
		const importedNames = await this.fetchImportedNames();
		return this.resolveWithHistory(dir, importedNames);
	}

	/**
	 * Dry-run: same logic but includes full stats without triggering import.
	 */
	async resolveOnly(dir: string): Promise<ResolveResult & { total: number }> {
		const importedNames = await this.fetchImportedNames();
		const result = this.resolveWithHistory(dir, importedNames);
		return { ...result, total: result.toImport.length + result.skipped.length };
	}

	private async fetchImportedNames(): Promise<Set<string>> {
		const rows = await this.clickHouseService.query<{ filename: string }>(
			`SELECT arrayJoin(files_list) AS filename
			 FROM music_analytics.etl_import_history FINAL
			 WHERE status = 'done'`,
			{},
			{ max_result_rows: 500_000 },
		);
		return new Set(rows.map((r) => r.filename));
	}

	private resolveWithHistory(dir: string, importedNames: Set<string>): ResolveResult {
		const allFiles = fs.readdirSync(dir).filter((f) => {
			const lower = f.toLowerCase();
			// Drop HTML and hidden files
			if (lower.endsWith('.html') || f.startsWith('.')) return false;
			const ext = path.extname(lower);
			return DATA_EXTS.has(ext) || lower.endsWith('.zip');
		});

		// --- Step 1: classify all files ---
		interface FileEntry {
			fileName: string;
			localPath: string;
			dspKey: string; // lowercase DSP name from filename
			period: string; // YYYYMM
			bracketN: number | null; // null = no bracket suffix
			isAuto: boolean;
			isTerr: boolean; // TERR1 / TERR2 etc
			baseNameNoSuffix: string; // canonical key for grouping (no [N], no -auto, includes _TERR)
		}

		const entries: FileEntry[] = [];

		for (const fileName of allFiles) {
			const localPath = path.join(dir, fileName);
			const bm = fileName.match(BOMBSHELTER_RE);
			if (bm) {
				const dspKey = bm[1].toLowerCase();
				const period = bm[2];
				const bracketN = bm[5] != null ? parseInt(bm[5], 10) : null;
				const isAuto = bm[7] === 'auto';
				const ext = bm[8];
				const midPart = bm[3]; // e.g. "Monthly-Sales_TERR1"
				const isTerr = /_(TERR\d+(-auto)?)/i.test(midPart);
				// Canonical base: strip [N] and -auto from filename
				const baseNameNoSuffix = `bombshelter-digital-services-llc_${dspKey}_${period}_${midPart}.${ext}`;
				entries.push({ fileName, localPath, dspKey, period, bracketN, isAuto, isTerr, baseNameNoSuffix });
				continue;
			}

			const rm = fileName.match(REVELATOR_RE);
			if (rm) {
				const year = rm[2];
				const monthName = rm[3].toLowerCase();
				const mm = MONTH_MAP[monthName];
				if (!mm) {
					this.logger.warn(`Unknown month name in Revelator file: ${fileName}`);
					continue;
				}
				const period = `${year}${mm}`;
				entries.push({
					fileName,
					localPath,
					dspKey: 'revelator',
					period,
					bracketN: null,
					isAuto: false,
					isTerr: false,
					baseNameNoSuffix: fileName,
				});
				continue;
			}

			// Older Deezer/MERLIN .txt pattern: BombshelterDigitalMERLIN_YYYYMMDD_YYYYMMDD[_TB].txt
			const merlinRe = /^(?:Deezer_)?BombshelterDigital(?:MERLIN)?_(\d{6})\d{2}_\d{8}/i;
			const mm2 = fileName.match(merlinRe);
			if (mm2) {
				entries.push({
					fileName,
					localPath,
					dspKey: 'deezer',
					period: mm2[1],
					bracketN: null,
					isAuto: false,
					isTerr: false,
					baseNameNoSuffix: fileName,
				});
				continue;
			}

			this.logger.debug(`Skipping unrecognized file: ${fileName}`);
		}

		// --- Step 2: resolve [N] suffix groups ---
		// Group by baseNameNoSuffix, per (dspKey, period, baseNameNoSuffix)
		const groups = new Map<string, FileEntry[]>();
		for (const e of entries) {
			const key = `${e.dspKey}|${e.period}|${e.baseNameNoSuffix}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(e);
		}

		const resolved: FileEntry[] = [];
		for (const group of groups.values()) {
			const hasBase = group.some((e) => e.bracketN === null && !e.isAuto);
			const autoFiles = group.filter((e) => e.isAuto);
			const bracketFiles = group.filter((e) => e.bracketN !== null);
			const baseFiles = group.filter((e) => e.bracketN === null && !e.isAuto);

			// -auto always wins, replaces base and brackets
			if (autoFiles.length > 0) {
				resolved.push(...autoFiles);
				continue;
			}

			// Base file exists → drop all [N]
			if (hasBase) {
				resolved.push(...baseFiles);
				continue;
			}

			// Only [N] variants — keep highest N
			if (bracketFiles.length > 0) {
				const highest = bracketFiles.reduce((a, b) =>
					(a.bracketN ?? 0) >= (b.bracketN ?? 0) ? a : b,
				);
				resolved.push(highest);
				continue;
			}

			resolved.push(...group);
		}

		// --- Step 3: dedup against FTP history ---
		const toImport: CanonicalFile[] = [];
		const skipped: CanonicalFile[] = [];

		for (const e of resolved) {
			const dspFolderName = DSP_FOLDER_MAP[e.dspKey];
			if (!dspFolderName) {
				this.logger.warn(`No DSP folder mapping for dsp key "${e.dspKey}" (file: ${e.fileName})`);
				skipped.push({
					localPath: e.localPath,
					canonicalName: e.baseNameNoSuffix,
					dspFolderName: e.dspKey,
					period: e.period,
					isAutoRevision: e.isAuto,
					skipReason: `no_dsp_mapping:${e.dspKey}`,
				});
				continue;
			}

			const entry: CanonicalFile = {
				localPath: e.localPath,
				canonicalName: e.baseNameNoSuffix,
				dspFolderName,
				period: e.period,
				isAutoRevision: e.isAuto,
			};

			// -auto always re-imports (bỏ qua FTP history check)
			if (!e.isAuto && importedNames.has(e.baseNameNoSuffix)) {
				skipped.push({ ...entry, skipReason: 'already_imported_via_ftp' });
			} else {
				toImport.push(entry);
			}
		}

		this.logger.log(
			`Resolved ${entries.length} files → toImport: ${toImport.length}, skipped: ${skipped.length}`,
		);

		return { toImport, skipped };
	}
}
