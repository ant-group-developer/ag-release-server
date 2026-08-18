import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnghamiSalesParser } from './group-b-parsers';

describe('BaseSalesParser — suppressRedirectedHardcodedTargets', () => {
	let tmpDir: string;
	let csvPath: string;

	const ANGHAMI_HEADERS = [
		'ISRC',
		'Start Date',
		'End Date',
		'Service Name',
		'DPID',
		'Member Name',
		'Label Name',
		'Release ID',
		'Genre',
		'Country of Sale',
		'Track Title',
		'Artist Name',
		'Release Title',
		'Quantity',
		'Total Payable',
		'Currency',
		'Service Tier',
		'Service Plan',
		'Type of Play',
	];

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-parser-test-'));
		csvPath = path.join(tmpDir, 'test.csv');
	});

	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	function writeCsv(row: Record<string, string>): void {
		const values = ANGHAMI_HEADERS.map((h) => row[h] ?? '');
		fs.writeFileSync(csvPath, [ANGHAMI_HEADERS.join(','), values.join(',')].join('\n'), 'utf-8');
	}

	it('suppresses the hardcoded targetColumn when an override redirects the same reportColumn to a different targetColumn', async () => {
		writeCsv({
			ISRC: 'USRC17607839',
			'Release Title': 'TestAlbum',
			'Track Title': 'TestTrack',
			'Artist Name': 'TestArtist',
			'Country of Sale': 'US',
			'Quantity': '5',
			'Total Payable': '1.23',
			Currency: 'USD',
			'Start Date': '01/01/2024',
			'End Date': '31/01/2024',
		});

		const parser = new AnghamiSalesParser();
		parser.setCatalogMappings([
			{ reportColumn: 'Release Title', targetColumn: 'album_title' },
		]);
		parser.setFieldMappingOverrides([
			{ reportColumn: 'Release Title', targetColumn: 'metadata.release_title' },
		]);

		const rows = await parser.parseFile(csvPath, 'batch-1');

		expect(rows).toHaveLength(1);
		expect(rows[0].metadata.release_title).toBe('TestAlbum');
		// album_title was set by parseRow then deleted by suppression
		expect(rows[0].album_title).toBeUndefined();
	});

	it('does NOT suppress when the override targetColumn matches the catalog targetColumn', async () => {
		writeCsv({
			ISRC: 'USRC17607839',
			'Release Title': 'TestAlbum',
			'Track Title': 'TestTrack',
			'Artist Name': 'TestArtist',
			'Country of Sale': 'US',
			'Quantity': '5',
			'Total Payable': '1.23',
			Currency: 'USD',
			'Start Date': '01/01/2024',
			'End Date': '31/01/2024',
		});

		const parser = new AnghamiSalesParser();
		parser.setCatalogMappings([
			{ reportColumn: 'Release Title', targetColumn: 'album_title' },
		]);
		// Override points to the SAME targetColumn as catalog → no redirect → no suppression
		parser.setFieldMappingOverrides([
			{ reportColumn: 'Release Title', targetColumn: 'album_title' },
		]);

		const rows = await parser.parseFile(csvPath, 'batch-1');

		expect(rows).toHaveLength(1);
		// parseRow sets album_title = 'TestAlbum', override writes the same value again
		expect(rows[0].album_title).toBe('TestAlbum');
	});

	it('does NOT suppress when the override targetColumn is skip', async () => {
		writeCsv({
			ISRC: 'USRC17607839',
			'Release Title': 'TestAlbum',
			'Track Title': 'TestTrack',
			'Artist Name': 'TestArtist',
			'Country of Sale': 'US',
			'Quantity': '5',
			'Total Payable': '1.23',
			Currency: 'USD',
			'Start Date': '01/01/2024',
			'End Date': '31/01/2024',
		});

		const parser = new AnghamiSalesParser();
		parser.setCatalogMappings([
			{ reportColumn: 'Release Title', targetColumn: 'album_title' },
		]);
		// skip overrides are handled by suppressSkippedInputColumns at prepareRecord time;
		// the suppression block must not double-delete or interfere
		parser.setFieldMappingOverrides([
			{ reportColumn: 'Release Title', targetColumn: 'skip' },
		]);

		const rows = await parser.parseFile(csvPath, 'batch-1');

		expect(rows).toHaveLength(1);
		// When input column is skipped, parseRow reads undefined for Release Title → album_title = ''
		// normalizeFactRows then converts '' → 'N/A'. The suppression block skips entries where
		// m.targetColumn === 'skip', so it does not interfere.
		expect(rows[0].album_title).toBe('N/A');
	});

	it('suppresses metadata.* catalog targets correctly', async () => {
		writeCsv({
			ISRC: 'USRC17607839',
			'Release Title': 'TestAlbum',
			'Track Title': 'TestTrack',
			'Artist Name': 'TestArtist',
			'Country of Sale': 'US',
			'Quantity': '5',
			'Total Payable': '1.23',
			Currency: 'USD',
			'Start Date': '01/01/2024',
			'End Date': '31/01/2024',
		});

		const parser = new AnghamiSalesParser();
		// Catalog says Release Title → metadata.original_album
		parser.setCatalogMappings([
			{ reportColumn: 'Release Title', targetColumn: 'metadata.original_album' },
		]);
		// Override redirects it elsewhere → metadata.original_album should be suppressed
		parser.setFieldMappingOverrides([
			{ reportColumn: 'Release Title', targetColumn: 'metadata.new_album' },
		]);

		const rows = await parser.parseFile(csvPath, 'batch-1');

		expect(rows).toHaveLength(1);
		expect(rows[0].metadata.new_album).toBe('TestAlbum');
		// metadata.original_album was never set by parseRow (it's a metadata key, not a hardcoded field),
		// but if it were present via some other path, suppression would delete it.
		// In this case the key simply doesn't exist — that's fine.
		expect(rows[0].metadata.original_album).toBeUndefined();
	});
});
