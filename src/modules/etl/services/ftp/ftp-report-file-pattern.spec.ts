import { canonicalizeFtpReportFilePattern } from './ftp-report-file-pattern';

describe('canonicalizeFtpReportFilePattern', () => {
	it('groups a CSV report and its outer zip archive into one rule', () => {
		const csv = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Monthly-Sales\\.csv$';
		const zip = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Monthly-Sales\\.csv\\.zip$';
		const expected = '^bombshelter-digital-services-llc_kkbox_KKBOXTW_\\d{6}_Monthly-Sales\\.csv(?:\\.zip)?$';

		expect(canonicalizeFtpReportFilePattern(csv)).toBe(expected);
		expect(canonicalizeFtpReportFilePattern(zip)).toBe(expected);
		expect(new RegExp(expected, 'i').test('bombshelter-digital-services-llc_kkbox_KKBOXTW_202607_Monthly-Sales.csv')).toBe(true);
		expect(new RegExp(expected, 'i').test('bombshelter-digital-services-llc_kkbox_KKBOXTW_202607_Monthly-Sales.csv.zip')).toBe(true);
	});

	it.each(['txt', 'tsv'])('groups %s files and their zip archives', (extension) => {
		expect(canonicalizeFtpReportFilePattern(`^report\\.${extension}$`)).toBe(`^report\\.${extension}(?:\\.zip)?$`);
		expect(canonicalizeFtpReportFilePattern(`^report\\.${extension}\\.zip$`)).toBe(`^report\\.${extension}(?:\\.zip)?$`);
	});

	it('does not broaden arbitrary zip archives', () => {
		expect(canonicalizeFtpReportFilePattern('^manifest\\.zip$')).toBe('^manifest\\.zip$');
	});
});
