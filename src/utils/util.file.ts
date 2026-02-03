import ExcelJS from 'exceljs';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { PassThrough } from 'stream';

export async function getFileExcelFromRaw(input: {
	title?: string;
	note?: string;
	records: Record<string, any>[];
	fileName: string;
	header?: string[];
	sheetName?: string;
}) {
	const {
		title,
		note,
		records,
		fileName,
		header,
		sheetName = 'Sheet1',
	} = input;

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet(sheetName);
	const keys = header ?? Object.keys(records[0]);
	let yFrozen = 0;

	//
	if (title) {
		yFrozen += 1;
		const titleRow = worksheet.addRow([title]);
		worksheet.mergeCells(titleRow.number, 1, titleRow.number, keys.length);
		titleRow.font = { size: 14, bold: true };
		titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
	}

	if (note) {
		yFrozen += 1;
		const noteRow = worksheet.addRow([note]);
		worksheet.mergeCells(noteRow.number, 1, noteRow.number, keys.length);
		noteRow.font = { size: 12, italic: true, color: { argb: 'FF666666' } };
		noteRow.alignment = {
			horizontal: 'right',
			vertical: 'middle',
			wrapText: true,
		};
	}

	worksheet.addRow(keys);

	records.forEach((record) => {
		const values = keys.map((key) => record[key]);
		worksheet.addRow(values);
	});

	// style
	worksheet.views = [{ state: 'frozen', ySplit: yFrozen }];

	const stream = new PassThrough();
	await workbook.xlsx.write(stream);
	stream.end();

	return {
		stream,
		fileName: `${fileName}.xlsx`,
		contentType:
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	};
}

export function getFileCsvFromRaw(options: {
	records: Record<string, any>[];
	fileName: string;
	header?: string[];
}) {
	const { records, fileName, header } = options;
	const keys = header ?? Object.keys(records[0]);
	const data = records.map((record) => keys.map((key) => record[key]));
	return buildCsvStream({ header: keys, data, fileName });
}

function buildCsvStream(input: {
	header: string[];
	data: (string | number | null)[][];
	fileName: string;
}) {
	const { header, data, fileName } = input;
	const stream = new PassThrough();

	// Ghi header
	stream.write(header.join(',') + '\n');

	for (const row of data) {
		const values = row.map((cell) => {
			if (cell == null) return '';
			const str = String(cell);
			if (/[",\n]/.test(str)) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		});
		stream.write(values.join(',') + '\n');
	}

	stream.end();

	return {
		stream,
		fileName: `${fileName}.csv`,
		contentType: 'text/csv; charset=utf-8',
	};
}

export function getFileTxtFromRelease(options: {
	release: Release;
	fileName: string;
}) {
	const { release, fileName } = options;

	const lines: string[] = [];

	// RELEASE INFO
	lines.push(release.title);
	lines.push(
		`Performed by: ${
			release.releaseArtists?.map((ra) => ra.artist?.name).join(', ') ||
			'-'
		}`,
	);
	lines.push(
		`Produced by: ℗ ${release.pLineYear || '-'} ${release.pLineOwner || '-'}`,
	);
	lines.push(`Catalog Id: ${release.catalogId || '-'}`);
	lines.push(`UPC: ${release.upc || '-'}`);
	lines.push('');

	// TRACKS
	lines.push('Tracks:');
	release.tracks?.forEach((track: Track, index: number) => {
		const trackTitle = `${String(index + 1)}: ${track.title || '-'}`;
		lines.push(trackTitle);

		const writers =
			track.trackArtists
				?.map((ta: TrackArtist) => ta.artist?.name)
				.filter(Boolean)
				.join(', ') || '-';

		lines.push(`Written by: ${writers}`);
		lines.push(`Published by: ${release.label?.name || '-'}`);
		lines.push('\n');
	});

	const stream = new PassThrough();
	stream.end(lines.join('\n'), 'utf-8');

	return {
		stream,
		fileName: `${fileName}.txt`,
		contentType: 'text/plain; charset=utf-8',
	};
}
