import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CsvStreamDetailWriter, multiplyDecimal } from './stream-detail-writer';

describe('multiplyDecimal', () => {
	it('multiplies a grouped USD amount by a VND rate at scale 18', () => {
		expect(multiplyDecimal('10.5', '25434')).toBe('267057');
	});

	it('rounds half away from zero to 18 decimal places', () => {
		expect(multiplyDecimal('0.000000000000000001', '1.5')).toBe(
			'0.000000000000000002',
		);
		expect(multiplyDecimal('-0.000000000000000001', '1.5')).toBe(
			'-0.000000000000000002',
		);
	});
});

describe('CsvStreamDetailWriter', () => {
	it('can reopen a flushed detail file in append mode without duplicating its header', async () => {
		const directory = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'analytics-export-writer-'),
		);
		const filePath = path.join(directory, 'detail.csv');

		try {
			const first = new CsvStreamDetailWriter(filePath);
			first.appendRow({ date: '2026-01', isrc: 'ISRC-1' });
			await first.ready();
			await first.flush();

			const second = new CsvStreamDetailWriter(filePath, true);
			second.appendRow({ date: '2026-02', isrc: 'ISRC-2' });
			await second.ready();
			await second.flush();

			const content = await fs.promises.readFile(filePath, 'utf8');
			expect(content.match(/Date,Workspace,DspName/g)).toHaveLength(1);
			expect(content).toContain('2026-01');
			expect(content).toContain('2026-02');
		} finally {
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	});
});
