import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VevoParser } from './vevo.parser';

describe('VevoParser', () => {
	let tmpDir: string;
	const batchId = 'test-batch';
	const parser = new VevoParser();

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vevo-parser-test-'));
	});
	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {}
	});

	function writeTsv(fileName: string, headers: string[], rows: string[][]): string {
		const fp = path.join(tmpDir, fileName);
		const lines = [headers.join('\t'), ...rows.map((r) => r.join('\t'))];
		fs.writeFileSync(fp, lines.join('\n'), 'utf-8');
		return fp;
	}

	const sharedHeaders = [
		'isrc',
		'upc',
		'date',
		'country',
		'track_name',
		'artist_name',
		'label',
		'member_name',
		'dpid',
	];
	const sharedValues = [
		'USXXX1234567',
		'012345678901',
		'20260620',
		'US',
		'Song',
		'Artist',
		'Label',
		'Member',
		'DPID',
	];

	it('counts views from user_interactions into quantity_total', async () => {
		const fp = writeTsv(
			'bombshelter-digital-services-llc_vevo_merlin_user_interactions_20260620.tsv',
			[...sharedHeaders, 'views', 'likes', 'dislikes', 'shares'],
			[[...sharedValues, '16314', '10', '1', '2']],
		);

		const rows = await parser.parseFile(fp, batchId);

		expect(rows).toHaveLength(1);
		expect(rows[0].quantity_total).toBe(16314);
		expect(rows[0].usage_type).toBe('view_social');
		expect(rows[0].metadata).toMatchObject({
			sub_type: 'user_interactions',
			views: '16314',
			likes: '10',
			dislikes: '1',
			shares: '2',
		});
		expect(rows[0].isrc).toBe('USXXX1234567');
		expect(rows[0].territory_code).toBe('US');
	});

	it('stores devices views in metadata and does not count them', async () => {
		const fp = writeTsv(
			'bombshelter-digital-services-llc_vevo_merlin_devices_20260620.tsv',
			[...sharedHeaders, 'device', 'views'],
			[[...sharedValues, 'MOBILE', '16462']],
		);

		const rows = await parser.parseFile(fp, batchId);

		expect(rows).toHaveLength(1);
		expect(rows[0].quantity_total).toBe(0);
		expect(rows[0].usage_type).toBe('view');
		expect(rows[0].metadata).toMatchObject({
			sub_type: 'devices',
			device: 'MOBILE',
			views: '16462',
		});
	});

	it('skips devices rows with zero views', async () => {
		const fp = writeTsv(
			'bombshelter-digital-services-llc_vevo_merlin_devices_20260620.tsv',
			[...sharedHeaders, 'device', 'views'],
			[[...sharedValues, 'TV', '0']],
		);

		const rows = await parser.parseFile(fp, batchId);
		expect(rows).toHaveLength(0);
	});

	it('stores user_attributes views_estimate in metadata and does not count them', async () => {
		const fp = writeTsv(
			'bombshelter-digital-services-llc_vevo_merlin_user_attributes_20260620.tsv',
			[...sharedHeaders, 'gender', 'age_group', 'views_estimate'],
			[[...sharedValues, 'FEMALE', 'AGE_18_24', '15893']],
		);

		const rows = await parser.parseFile(fp, batchId);

		expect(rows).toHaveLength(1);
		expect(rows[0].quantity_total).toBe(0);
		expect(rows[0].usage_type).toBe('view_demo');
		expect(rows[0].metadata).toMatchObject({
			sub_type: 'user_attributes',
			gender: 'FEMALE',
			age_group: 'AGE_18_24',
			views_estimate: '15893',
		});
	});
});
