import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FacebookSalesParser } from './group-ce-parsers';

describe('FacebookSalesParser — SFV / WhatsApp aggregate', () => {
	let tmpDir: string;
	let batchId: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbk-parser-test-'));
		batchId = 'test-batch';
	});
	afterEach(() => {
		try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
	});

	function writeCsv(fileName: string, headers: string[], rows: string[][]): string {
		const fp = path.join(tmpDir, fileName);
		const lines = [headers.join(','), ...rows.map((r) => r.join(','))];
		fs.writeFileSync(fp, lines.join('\n'), 'utf-8');
		return fp;
	}

	// ── SFV ──────────────────────────────────────────────
	it('parses SFV aggregate rows with isrc=N/A and payout revenue', async () => {
		const fp = writeCsv('bombshelter-digital-services-llc_Facebook-SFV_202601.csv', ['page_name', 'dte', 'territory', 'payout', 'market_index', 'event_count'], [
			['"ANT MUSIC LLC"', '2026-01-01', 'JP', '0.003', '0.38400', '3'],
			['"ANT MUSIC LLC"', '2026-01-01', 'PH', '0.01', '0.04700', '1'],
		]);
		const parser = new FacebookSalesParser();
		const rows = await parser.parseFile(fp, batchId);
		expect(rows).toHaveLength(2);
		expect(rows[0].isrc).toBe('N/A');
		expect(rows[0].upc).toBe('N/A');
		expect(rows[0].release_id).toBe('N/A');
		expect(rows[0].track_title).toBe('N/A');
		expect(rows[0].revenue_usd).toBe('0.003');
		expect(rows[0].revenue_local).toBe('0.003');
		expect(rows[0].revenue_currency).toBe('USD');
		expect(rows[0].territory_code).toBe('JP');
		expect(rows[0].quantity).toBe(3);
		expect(rows[0].usage_type).toBe('SFV');
		expect(rows[0].reporting_period_start).toBe('2026-01-01');
		expect(rows[0].reporting_period_end).toBe('2026-01-01');
		expect(rows[0].metadata.market_index).toBe('0.38400');
		expect(rows[0].dsp_id).toBe('facebook');
		expect(rows[1].territory_code).toBe('PH');
		expect(rows[1].revenue_usd).toBe('0.01');
	});

	it('parses WhatsApp-Incentive-Pool rows with correct usage_type', async () => {
		const fp = writeCsv('bombshelter-digital-services-llc_WhatsApp-Incentive-Pool_202601.csv', ['page_name', 'dte', 'territory', 'payout', 'market_index', 'event_count'], [
			['"ANT MUSIC LLC"', '2026-01-01', 'US', '0.04', '1.00000', '2'],
		]);
		const parser = new FacebookSalesParser();
		const rows = await parser.parseFile(fp, batchId);
		expect(rows).toHaveLength(1);
		expect(rows[0].isrc).toBe('N/A');
		expect(rows[0].revenue_usd).toBe('0.04');
		expect(rows[0].territory_code).toBe('US');
		expect(rows[0].usage_type).toBe('WhatsApp-Incentive-Pool');
	});

	it('skips rows where payout is 0 and event_count is 0', async () => {
		const fp = writeCsv('bombshelter-digital-services-llc_Facebook-SFV_202601.csv', ['page_name', 'dte', 'territory', 'payout', 'market_index', 'event_count'], [
			['"ANT MUSIC LLC"', '2026-01-01', 'JP', '0', '0.38400', '0'],
			['"ANT MUSIC LLC"', '2026-01-01', 'JP', '0.003', '0.38400', '3'],
		]);
		const parser = new FacebookSalesParser();
		const rows = await parser.parseFile(fp, batchId);
		// first row is empty aggregate -> skipped
		expect(rows).toHaveLength(1);
		expect(rows[0].revenue_usd).toBe('0.003');
	});

	it('does NOT skip SFV row where payout=0 but event_count>0', async () => {
		const fp = writeCsv('bombshelter-digital-services-llc_Facebook-SFV_202601.csv', ['page_name', 'dte', 'territory', 'payout', 'market_index', 'event_count'], [
			['"ANT MUSIC LLC"', '2026-01-01', 'IN', '0', '0.03200', '2'],
		]);
		const parser = new FacebookSalesParser();
		const rows = await parser.parseFile(fp, batchId);
		expect(rows).toHaveLength(1);
		expect(rows[0].quantity).toBe(2);
	});

	// ── AL/UGC regression ────────────────────────────────
	it('still parses AL/UGC files with elected_isrc correctly (regression)', async () => {
		const fp = writeCsv('bombshelter-digital-services-llc_Facebook-AL-Consumption_202601.csv', ['elected_isrc', 'start_date', 'end_date', 'service', 'page_name', 'release_id', 'country', 'track_title', 'track_artist', 'event_count', 'usd_payable', 'product'], [
			['USRC17607839', '2026-01-01', '2026-01-31', 'Meta', '"ANT MUSIC LLC"', 'REL123', 'US', '"Track Title"', '"Artist"', '10', '1.23', 'AL-Consumption'],
		]);
		const parser = new FacebookSalesParser();
		const rows = await parser.parseFile(fp, batchId);
		expect(rows).toHaveLength(1);
		expect(rows[0].isrc).toBe('USRC17607839');
		expect(rows[0].revenue_usd).toBe('1.23');
		expect(rows[0].territory_code).toBe('US');
	});
});
