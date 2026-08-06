import { canonicalizeFtpReportFilePattern } from './ftp-report-file-pattern';

describe('canonicalizeFtpReportFilePattern', () => {
	it('groups a CSV report and its outer zip archive into one rule', () => {
		const csv = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Monthly-Sales\\.csv$';
		const zip = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Monthly-Sales\\.csv\\.zip$';
		const expected = '^bombshelter-digital-services-llc_kkbox_KKBOX[A-Z]{2}_\\d{6}_Monthly-Sales\\.csv(?:\\.zip)?$';

		expect(canonicalizeFtpReportFilePattern(csv)).toBe(expected);
		expect(canonicalizeFtpReportFilePattern(zip)).toBe(expected);
		expect(new RegExp(expected, 'i').test('bombshelter-digital-services-llc_kkbox_KKBOXTW_202607_Monthly-Sales.csv')).toBe(true);
		expect(new RegExp(expected, 'i').test('bombshelter-digital-services-llc_kkbox_KKBOXTW_202607_Monthly-Sales.csv.zip')).toBe(true);
		expect(new RegExp(expected, 'i').test('bombshelter-digital-services-llc_kkbox_KKBOXTH_202607_Monthly-Sales.csv')).toBe(true);
	});

	it('does not broaden other KKBOX report formats', () => {
		const pattern = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Daily-Sales\\.csv$';
		expect(canonicalizeFtpReportFilePattern(pattern)).toBe(pattern.replace('\\.csv$', '\\.csv(?:\\.zip)?$'));
	});

	it('groups SoundCloud invalid-plays monthly reports into one rule', () => {
		const january = '^bombshelter-digital-services-llc_soundcloud_merlin-invalid-plays_\\d+-01\\.csv(?:\\.zip)?$';
		const december = '^bombshelter-digital-services-llc_soundcloud_merlin-invalid-plays_\\d+-12\\.csv(?:\\.zip)?$';
		const expected = '^bombshelter-digital-services-llc_soundcloud_merlin-invalid-plays_\\d{4}-\\d{2}\\.csv(?:\\.zip)?$';

		expect(canonicalizeFtpReportFilePattern(january)).toBe(expected);
		expect(canonicalizeFtpReportFilePattern(december)).toBe(expected);
		expect(new RegExp(expected).test('bombshelter-digital-services-llc_soundcloud_merlin-invalid-plays_2026-07.csv.zip')).toBe(true);
	});

	it.each(['txt', 'tsv'])('groups %s files and their zip archives', (extension) => {
		expect(canonicalizeFtpReportFilePattern(`^report\\.${extension}$`)).toBe(`^report\\.${extension}(?:\\.zip)?$`);
		expect(canonicalizeFtpReportFilePattern(`^report\\.${extension}\\.zip$`)).toBe(`^report\\.${extension}(?:\\.zip)?$`);
	});

	it('does not broaden arbitrary zip archives', () => {
		expect(canonicalizeFtpReportFilePattern('^manifest\\.zip$')).toBe('^manifest\\.zip$');
	});
});
