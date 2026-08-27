import { resolveVevoTrendsFiles } from './vevo-sync.policy';

describe('resolveVevoTrendsFiles', () => {
	const devicesFile =
		'bombshelter-digital-services-llc_vevo_merlin_devices_20260620.tsv';
	const attrsFile =
		'bombshelter-digital-services-llc_vevo_merlin_user_attributes_20260620.tsv';
	const interactionsFile =
		'bombshelter-digital-services-llc_vevo_merlin_user_interactions_20260620.tsv';

	it('returns null for any folder that is not the vevo trends folder', () => {
		const result = resolveVevoTrendsFiles('trends', 'scd-soundcloud', [
			devicesFile,
		]);
		expect(result).toBeNull();
	});

	it('returns null for non-trends categories even on the vevo folder', () => {
		const result = resolveVevoTrendsFiles('usage', 'vvo-vevo', [devicesFile]);
		expect(result).toBeNull();
	});

	it('selects all 3 vevo files and forces the vevo parser', () => {
		const result = resolveVevoTrendsFiles('trends', 'vvo-vevo', [
			devicesFile,
			attrsFile,
			interactionsFile,
		]);
		expect(result).toEqual({
			selected: [devicesFile, attrsFile, interactionsFile],
			parserCode: 'vevo',
		});
	});

	it('selects the .tsv.zip names that FTP actually delivers', () => {
		const devicesZip = `${devicesFile}.zip`;
		const attrsZip = `${attrsFile}.zip`;
		const interactionsZip = `${interactionsFile}.zip`;
		const result = resolveVevoTrendsFiles('trends', 'vvo-vevo', [
			devicesZip,
			attrsZip,
			interactionsZip,
			'readme.txt',
		]);
		expect(result).toEqual({
			selected: [devicesZip, attrsZip, interactionsZip],
			parserCode: 'vevo',
		});
	});

	it('matches nested FTP paths by basename, zip or not', () => {
		const result = resolveVevoTrendsFiles('trends', 'vvo-vevo', [
			`inner/${devicesFile}.zip`,
			attrsFile,
		]);
		expect(result!.selected).toEqual([`inner/${devicesFile}.zip`, attrsFile]);
	});

	it('matches the folder name case-insensitively', () => {
		const result = resolveVevoTrendsFiles('trends', 'VVO-VEVO', [devicesFile]);
		expect(result).not.toBeNull();
		expect(result!.selected).toEqual([devicesFile]);
	});

	it('keeps only files matching the 3 vevo patterns', () => {
		const result = resolveVevoTrendsFiles('trends', 'vvo-vevo', [
			devicesFile,
			'bombshelter-digital-services-llc_vevo_merlin_devices_2026062.tsv', // 7-digit date
			'bombshelter-digital-services-llc_vevo_merlin_unknown_20260620.tsv',
			'readme.txt',
		]);
		expect(result!.selected).toEqual([devicesFile]);
	});

	it('returns an empty selection when the folder has no vevo files yet', () => {
		const result = resolveVevoTrendsFiles('trends', 'vvo-vevo', [
			'readme.txt',
		]);
		expect(result).toEqual({ selected: [], parserCode: 'vevo' });
	});
});
