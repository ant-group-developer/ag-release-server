/** A .zip wrapper does not change the report schema or its import rule. */
const DATA_FILE_SUFFIXES = ['\\.csv', '\\.txt', '\\.tsv'];
const OPTIONAL_ZIP_SUFFIX = '(?:\\.zip)?';

/**
 * KKBOX places its two-letter territory after the literal `KKBOX` rather than
 * between separators (for example, `KKBOXHK` and `KKBOXTW`).  It is part of
 * the report filename, not a distinct report layout, so keep one rule for all
 * territories.
 */
function canonicalizeKkboxTerritory(core: string): string {
	return core.replace(
		/KKBOX[A-Z]{2}(?=_\\d\{6\}_Monthly-Sales)/g,
		'KKBOX[A-Z]{2}',
	);
}

/**
 * SoundCloud's invalid-plays report is one schema per month. Legacy discovery
 * created one rule for every literal `-01` through `-12` suffix; retain the
 * year-month shape and collapse those rules into one.
 */
function canonicalizeSoundcloudInvalidPlaysPeriod(core: string): string {
	return core.replace(
		/soundcloud_merlin-invalid-plays_\\d\+-(?:0[1-9]|1[0-2])(?=\\\.csv)/g,
		'soundcloud_merlin-invalid-plays_\\d{4}-\\d{2}',
	);
}

export function canonicalizeFtpReportFilePattern(pattern: string): string {
	if (!pattern.endsWith('$')) return pattern;

	let core = pattern.slice(0, -1);
	const lower = core.toLowerCase();
	if (lower.endsWith(OPTIONAL_ZIP_SUFFIX)) {
		core = core.slice(0, -OPTIONAL_ZIP_SUFFIX.length);
	} else if (lower.endsWith('\\.zip')) {
		core = core.slice(0, -'\\.zip'.length);
	}

	if (!DATA_FILE_SUFFIXES.some((suffix) => core.toLowerCase().endsWith(suffix))) {
		return pattern;
	}
	core = canonicalizeKkboxTerritory(core);
	core = canonicalizeSoundcloudInvalidPlaysPeriod(core);
	return `${core}${OPTIONAL_ZIP_SUFFIX}$`;
}
