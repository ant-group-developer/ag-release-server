import * as path from 'path';

/**
 * Hard-coded file-selection policy for the Vevo trends folder.
 *
 * Vevo delivers 3 TSV files per day that all measure the SAME video views
 * sliced by different dimensions (devices / user_attributes / user_interactions).
 * The generic rule engine only picks one file, so gender/age/device
 * data never lands in the fact table. This policy bypasses the rule engine
 * entirely for the Vevo trends folder and always selects all 3 files.
 * The VevoParser dispatches per file name and prevents double-counting
 * (only user_interactions contributes to quantity_total; devices/attributes
 * stay in metadata for device / gender / age stats).
 */
const VEVO_TRENDS_FOLDER = 'vvo-vevo';
// Catalog key from FtpParserConfigService.buildCatalog (PARSER_REGISTRY['vvo']).
const VEVO_PARSER_CODE = 'ftp.trends.vvo';

// FTP delivers these as `.tsv.zip`; unzipped local samples are `.tsv`.
const VEVO_TRENDS_FILE_PATTERNS = [
	/^bombshelter-digital-services-llc_vevo_merlin_devices_\d{8}\.tsv(?:\.zip)?$/i,
	/^bombshelter-digital-services-llc_vevo_merlin_user_attributes_\d{8}\.tsv(?:\.zip)?$/i,
	/^bombshelter-digital-services-llc_vevo_merlin_user_interactions_\d{8}\.tsv(?:\.zip)?$/i,
];

export interface VevoTrendsDecision {
	selected: string[];
	parserCode: string;
}

/** Trả null nếu không phải folder vevo trends — caller đi rule engine như bình thường. */
export function resolveVevoTrendsFiles(
	category: string,
	dspFolder: string,
	availableFiles: string[],
): VevoTrendsDecision | null {
	if (category !== 'trends') return null;
	if (dspFolder.toLowerCase() !== VEVO_TRENDS_FOLDER) return null;

	const selected = availableFiles.filter((file) => {
		const name = path.posix.basename(file);
		return VEVO_TRENDS_FILE_PATTERNS.some((re) => re.test(name));
	});

	return { selected, parserCode: VEVO_PARSER_CODE };
}
