import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CsvStreamDetailWriter } from './stream-detail-writer';

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
