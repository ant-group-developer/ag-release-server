import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guard (NFR2): the domain must stay pure — no framework/infra imports.
 * Reads every .ts file under domain/ and asserts none import a forbidden package.
 * If this fails, someone leaked infrastructure into the domain — move it to an adapter.
 */
const DOMAIN_DIR = join(__dirname, '..');
const FORBIDDEN =
	/(from|require\()\s*['"](@nestjs\/|typeorm|ssh2|bullmq|xstate|@grpc\/)/;

function collectTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...collectTsFiles(full));
		} else if (entry.endsWith('.ts')) {
			out.push(full);
		}
	}
	return out;
}

describe('domain purity guard (NFR2)', () => {
	const files = collectTsFiles(DOMAIN_DIR);

	it('finds domain files to scan', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)('%s has no framework/infra import', (file) => {
		const content = readFileSync(file, 'utf8');
		const offending = content
			.split('\n')
			.filter((line) => FORBIDDEN.test(line));
		expect(offending).toEqual([]);
	});
});
