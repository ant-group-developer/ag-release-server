/** A .zip wrapper does not change the report schema or its import rule. */
const DATA_FILE_SUFFIXES = ['\\.csv', '\\.txt', '\\.tsv'];
const OPTIONAL_ZIP_SUFFIX = '(?:\\.zip)?';

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
	return `${core}${OPTIONAL_ZIP_SUFFIX}$`;
}
