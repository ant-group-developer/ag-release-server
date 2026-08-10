/*
 * Adds a self-contained Bombshelter input example sheet to the comparison
 * report. All rows are deliberately synthetic and must not be imported.
 */

const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, 'analytics', 'Bombshelter-Catalog vs WMG.xlsx');
const SHEET_NAME = 'Mau nhap test';

const headers = [
	'ReleaseType', 'ReleaseId', 'AlbumUPC', 'AlbumId', 'AlbumArtist', 'AlbumTitle', 'AlbumTitleVersion',
	'DiscNumber', 'TrackNumber', 'TrackId', 'TrackTitle', 'TrackTitleVersion', 'TrackISRC', 'TrackArtist',
	'MainTrackArtist', 'TrackComposer', 'TrackContributors', 'TrackFileName', 'TrackLanguage', 'Explicit',
	'Label', 'OriginalReleaseDate', 'Category', 'Duration', 'PLineYear', 'PLineText', 'CLineYear', 'CLineText',
	'AlbumPriceCode', 'TrackPriceCode', 'Territories', 'ExcludedTerritories',
];

const rows = [
	['Album', 'TEST900001', '990000000001', 'TEST-ALBUM-001', 'Demo Artist One', 'Neon Skyline EP', '', '01', '01', 'TEST-TRACK-001', 'Midnight Signal', '', 'ZZABC2600001', 'Demo Artist One', 'Demo Artist One', 'Demo Writer One / Composer', '', 'midnight-signal.wav', 'English', 'no', 'Demo Label', '2026-08-08', 'Electronic', '202', '2026', 'Demo Label', '2026', 'Demo Label', '', '', 'WW', ''],
	['Album', 'TEST900001', '990000000001', 'TEST-ALBUM-001', 'Demo Artist One', 'Neon Skyline EP', '', '01', '02', 'TEST-TRACK-002', 'Glass Horizon', 'Acoustic', 'ZZABC2600002', 'Demo Artist One', 'Demo Artist One', 'Demo Writer One / Composer', '', 'glass-horizon-acoustic.wav', 'English', 'no', 'Demo Label', '2026-08-08', 'Electronic', '214', '2026', 'Demo Label', '2026', 'Demo Label', '', '', 'WW', ''],
	['Album', 'TEST900002', '990000000002', 'TEST-ALBUM-002', 'Demo Artist Two', 'Paper Satellites', 'Deluxe', '01', '01', 'TEST-TRACK-003', 'Orbiting You', '', 'ZZABC2600003', 'Demo Artist Two', 'Demo Artist Two', 'Demo Writer Two / Composer', '', 'orbiting-you.wav', 'English', 'no', 'Demo Label', '2026-08-09', 'Pop', '188', '2026', 'Demo Label', '2026', 'Demo Label', '', '', 'WW', ''],
	['Album', 'TEST900002', '990000000002', 'TEST-ALBUM-002', 'Demo Artist Two', 'Paper Satellites', 'Deluxe', '01', '02', 'TEST-TRACK-004', 'Static Bloom', 'Instrumental', 'ZZABC2600004', 'Demo Artist Two', 'Demo Artist Two', 'Demo Writer Two / Composer', '', 'static-bloom-instrumental.wav', 'Instrumental', 'no', 'Demo Label', '2026-08-09', 'Pop', '196', '2026', 'Demo Label', '2026', 'Demo Label', '', '', 'WW', ''],
];

function fill(argb) {
	return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

async function run() {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(REPORT);
	const existing = workbook.getWorksheet(SHEET_NAME);
	if (existing) workbook.removeWorksheet(existing.id);
	const worksheet = workbook.addWorksheet(SHEET_NAME);

	worksheet.mergeCells(1, 1, 1, headers.length);
	const title = worksheet.getCell(1, 1);
	title.value = 'MAU DU LIEU TEST - TAT CA UPC, ISRC, ID VA TEN BEN DUOI DEU LA GIA, KHONG IMPORT';
	title.fill = fill('FF7F6000');
	title.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
	title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
	worksheet.getRow(1).height = 28;

	worksheet.getRow(2).values = headers;
	worksheet.getRow(2).height = 34;
	worksheet.getRow(2).eachCell((cell) => {
		cell.fill = fill('FFFCE4D6');
		cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
		cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
	});

	for (const values of rows) {
		const row = worksheet.addRow(values);
		row.height = 32;
		row.eachCell((cell) => {
			cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
			cell.alignment = { vertical: 'top', wrapText: true };
			cell.border = {
				bottom: { style: 'hair', color: { argb: 'FFE7E6E6' } },
				right: { style: 'hair', color: { argb: 'FFE7E6E6' } },
			};
		});
	}

	const widths = [14, 16, 18, 18, 22, 28, 22, 12, 14, 18, 28, 22, 18, 22, 38, 32, 28, 32, 18, 12, 20, 20, 18, 14, 14, 20, 14, 20, 18, 18, 14, 20];
	widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
	worksheet.autoFilter = { from: 'A2', to: 'AF2' };
	worksheet.views = [{ state: 'frozen', ySplit: 2 }];

	await workbook.xlsx.writeFile(REPORT);
	console.log(`Added ${rows.length} synthetic rows to ${SHEET_NAME} in ${REPORT}`);
}

run().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
