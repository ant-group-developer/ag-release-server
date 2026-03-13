import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ExcelGetDataService } from './excel.get-data';

@Injectable()
export class ExcelService {
	constructor(private readonly excelGetDataService: ExcelGetDataService) { }

	async downloadTemplate(res: Response) {
		const [
			albumFormats,
			priceTiers,
			genres,
			trackSensitives,
			languages,
			policies,
			dsps
		] = await Promise.all([
			this.excelGetDataService.getAlbumFormats(),
			this.excelGetDataService.getPriceTiers(),
			this.excelGetDataService.getGenres(),
			this.excelGetDataService.getTrackSensitives(),
			this.excelGetDataService.getLanguages(),
			this.excelGetDataService.getTrackPolicies(),
			this.excelGetDataService.getDsps(),
		]);

		const workbook = new ExcelJS.Workbook();

		/* =====================================================
	   COLORS
	===================================================== */

		const blueBg = 'FFB8CCE4';
		const lightBlueBg = 'FFD6DDE4';
		const greyBg = 'FFd6dde4';
		const darkBlueText = 'FF1F4E79';
		const greyText = 'FFf2f2f2';
		const greyContent = 'FFBFBFBF';

		/* =====================================================
	   SHEET 1
	===================================================== */

		const sheet1 = workbook.addWorksheet('METADATA TEMPLATE');

		/* COLUMN WIDTH A → BC */

		for (let i = 1; i <= 55; i++) {
			sheet1.getColumn(i).width = 32;
		}

		/* =====================================================
   HEADER TITLE + COLOUR KEY
===================================================== */
		sheet1.mergeCells('A1:A3');

		for (let r = 1; r <= 3; r++) {
			const cell = sheet1.getCell(`A${r}`);

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: blueBg },
			};
		}

		/* LOGO PATH */

		const defaultLogoPath = path.join(__dirname, 'asset/logo.png');

		const logo = await this.excelGetDataService.getLogo();

		const logoPath = logo
			? path.join(process.cwd(), logo)
			: defaultLogoPath;

		/* ADD IMAGE */

		const logoBuffer = fs.readFileSync(logoPath);

		const logoId = workbook.addImage({
			buffer: logoBuffer as any,
			extension: 'png',
		});

		/* SET COLUMN WIDTH = IMAGE WIDTH */

		const imageWidth = 100;
		sheet1.getColumn('A').width = imageWidth / 7;

		/* INSERT IMAGE */

		sheet1.addImage(logoId, {
			tl: { col: 0, row: 0 },
			ext: { width: imageWidth, height: 100 },
		});

		sheet1.mergeCells('B1:D1');
		sheet1.mergeCells('B2:D2');
		sheet1.mergeCells('B3:D3');

		sheet1.mergeCells('E1:E3');

		/* TITLE */

		sheet1.getCell('B1').value = 'ANT MUSIC - DIGITAL CATALOGUE MANAGEMENT';
		sheet1.getCell('B2').value = 'METADATA SHEET';
		sheet1.getCell('B3').value = 'METADATA TEMPLATE';

		['B1', 'B2', 'B3'].forEach((c) => {
			const cell = sheet1.getCell(c);

			cell.font = {
				name: 'Arial Black',
				bold: true,
				size: 14,
				color: { argb: darkBlueText },
			};

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: blueBg },
			};

			cell.alignment = {
				vertical: 'middle',
			};
		});

		sheet1.getCell('F1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: blueBg },
		};

		sheet1.getCell('F2').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: lightBlueBg },
		};

		sheet1.getCell('F3').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: greyBg },
		};
		/* COLOUR KEY */

		sheet1.getCell('E1').value = 'Colour Key:';

		sheet1.getCell('F1').value = 'BLUE';
		sheet1.getCell('F1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: blueBg },
		};
		sheet1.getCell('F1').font = {
			name: 'Arial Black',
			size: 10,
			color: { argb: darkBlueText },
		};

		sheet1.getCell('F2').value = 'LIGHT BLUE';
		sheet1.getCell('F2').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: greyBg },
		};
		sheet1.getCell('F2').font = {
			name: 'Arial Black',
			size: 10,
			color: { argb: darkBlueText },
		};

		sheet1.getCell('F3').value = 'GREY';
		sheet1.getCell('F3').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: greyText },
		};
		sheet1.getCell('F3').font = {
			name: 'Arial Black',
			size: 10,
			color: { argb: greyContent },
		};

		sheet1.getCell('G1').value = '- Blue columns are required';
		sheet1.getCell('G1').font = {
			name: 'Arial',
			size: 10,
			color: { argb: darkBlueText },
		};

		sheet1.getCell('G2').value = '- Light blue columns are optional';
		sheet1.getCell('G2').font = {
			name: 'Arial',
			size: 10,
			color: { argb: darkBlueText },
		};

		sheet1.getCell('G3').value = '- Grey columns are deprecated';
		sheet1.getCell('G3').font = {
			name: 'Arial',
			size: 10,
			color: { argb: darkBlueText },
		};

		sheet1.getCell('E1').alignment = {
			vertical: 'middle',
			horizontal: 'right',
		};
		sheet1.getCell('F1').alignment = {
			vertical: 'middle',
			horizontal: 'center',
		};
		sheet1.getCell('F2').alignment = {
			vertical: 'middle',
			horizontal: 'center',
		};
		sheet1.getCell('F3').alignment = {
			vertical: 'middle',
			horizontal: 'center',
		};
		/* ROW HEIGHT */

		sheet1.getRow(1).height = 28;
		sheet1.getRow(2).height = 22;
		sheet1.getRow(3).height = 22;

		/* =====================================================
	   MERGE ROW 4 → 8
	===================================================== */
		sheet1.mergeCells('A4:BC8');
		/* =====================================================
	   ROW 9 SECTIONS
	===================================================== */

		function setSection(range: string, text: string) {
			sheet1.mergeCells(range);

			const cell = sheet1.getCell(range.split(':')[0]);

			cell.value = text;

			cell.font = {
				name: 'Arial Black',
				bold: true,
				size: 12,
				color: { argb: darkBlueText },
			};

			cell.alignment = {
				horizontal: 'center',
				vertical: 'middle',
			};

			const startCol = Number(sheet1.getCell(range.split(':')[0]).col);
			const endCol = Number(sheet1.getCell(range.split(':')[1]).col);

			for (let c = startCol; c <= endCol; c++) {
				sheet1.getCell(9, c).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: blueBg },
				};
			}
		}

		setSection('A9:J9', 'SECTION 1: RELEASE LEVEL');
		setSection('K9:O9', 'RIGHTS CLEARANCES');
		setSection('Q9:T9', '(P) AND (C)');
		setSection('V9:Y9', 'GENRES');
		setSection('AA9:AB9', 'VOLUMES');
		setSection('AC9:AJ9', 'SECTION 2: TRACK LEVEL');
		setSection('AK9:AL9', '(P) AND (C)');
		setSection('AM9:AP9', 'GENRES');
		setSection('AR9:AS9', 'SOUND RECORDING CONTRIBUTORS');
		setSection('AT9:AV9', 'MUSICAL WORK CONTRIBUTORS');
		setSection('AW9:AY9', 'SOUND RECORDING PERFORMANCE');

		sheet1.getRow(9).height = 30;
		/* Fill blue for empty cells row 9 */

		for (let col = 1; col <= 55; col++) {
			const cell = sheet1.getCell(9, col);

			if (!cell.fill) {
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: blueBg },
				};
			}

			cell.font = {
				name: 'Arial Black',
				bold: true,
				size: 12,
				color: { argb: darkBlueText },
			};
		}

		/* =====================================================
	   ROW 10 HEADERS
	===================================================== */

		const headers = [
			'CHECK NO.',
			'RELEASE TITLE',
			'VERSION DESCRIPTION',
			'ARTIST(S)',
			'ARTIST SPOTIFY ID',
			'DISPLAY ARTIST',
			'GTIN',
			'CATALOGUE NO.',
			'RELEASE FORMAT TYPE',
			'PRICE BAND',
			'LICENSED TERRITORIES to INCLUDE',
			'LICENSED TERRITORIES to EXCLUDE',
			'RELEASE START DATE',
			'DSP',
			'RELEASE END DATE',
			'GRID',
			'(P) YEAR',
			'(P) HOLDER',
			'(C) YEAR',
			'(C) HOLDER',
			'LABEL',
			'GENRE(S)',
			'GENRE(S)',
			'GENRE(S)',
			'GENRE(S)',
			'EXPLICIT CONTENT',
			'VOLUME NO.',
			'VOLUME TOTAL',
			'TRACK NO.',
			'TRACK TITLE',
			'MIX / VERSION',
			'ARTIST(S)',
			'ARTIST SPOTIFY ID',
			'DISPLAY ARTIST',
			'ISRC',
			'GRID',
			'(P) YEAR',
			'(P) HOLDER',
			'GENRE(S)',
			'GENRE(S)',
			'GENRE(S)',
			'GENRE(S)',
			'EXPLICIT CONTENT',
			'PRODUCER(S)',
			'MIXER(S)',
			'COMPOSER(S)',
			'LYRICIST(S)',
			'PUBLISHER(S)',
			'HAS INSTRUMENTS?',
			'HAS VOCALS/LANGUAGE?',
			'IS AI TRACK ?',
			'PREVIEW START TIME',
			'ORIGINAL RELEASE DATE',
			'DIGITAL UGC',
			'FILE PATH',
		];

		headers.forEach((text, i) => {
			const cell = sheet1.getCell(10, i + 1);

			cell.value = text;

			cell.font = {
				name: 'Arial Black',
				bold: true,
				size: 10,
				color: { argb: darkBlueText },
			};

			cell.alignment = {
				horizontal: 'center',
				vertical: 'middle',
				wrapText: true,
			};

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: blueBg },
			};
		});

		/* =====================================================
	   ROW 11 INSTRUCTIONS
	===================================================== */

		const instructions = [
			'1,2,n',
			'',
			'To distinguish multiple versions',
			"Separate multiples with pipes '|'",
			"Separate multiples with pipes '|'",
			"Use 'feat.', 'and', 'with'…",
			'UPC/EAN',
			'',
			'Select from drop-down',
			'Select from drop-down',
			'Enter territories as ISO Codes with pipe "|" separation or WORLD',
			'Enter territories as ISO Codes with pipe "|" separation',
			'DD/MM/YYYY or YYYY/MM/DD',
			'Digital service provider',
			'DD/MM/YYYY or YYYY/MM/DD',
			'',
			'YYYY only',
			'Legal name of rights holder',
			'YYYY only',
			'Legal name of rights holder',
			'Label brand name',
			'Main Genre (drop-down menu)',
			'Main SubGenre (free text)',
			'Alternate Genre (drop-down menu)',
			'Alternate SubGenre (free text)',
			'Select from drop-down',
			'1, 2,..N',
			'N',
			'1,2,3…n',
			'Title only - no mix/version',
			'To distinguish multiple versions',
			"Separate multiples with pipes '|'",
			"Separate multiples with pipes '|'",
			"Use 'feat.', 'and', 'with'…",
			'',
			'',
			'YYYY only',
			'Legal name of rights holder',
			'Main Genre (drop-down menu)',
			'Main SubGenre (free text)',
			'Alternate Genre (drop-down menu)',
			'Alternate SubGenre (free text)',
			'Select from drop-down',
			"Separate multiples with pipes '|'",
			"Separate multiples with pipes '|'",
			"Separate multiples with pipes '|'",
			"Separate multiples with pipes '|'. Lyricist is required if the Sound Recording has vocals",
			"Separate multiples with pipes '|'",
			'Are musical instruments heard in the recording? (drop-down menu)',
			'Is there a human vocal performance? If so what is the main language used? (drop-down menu)',
			'Is this track made by AI ?',
			'Count in seconds only',
			'DD/MM/YYYY or YYYY/MM/DD',
			'Select from drop-down',
			'',
		];

		const instructionRow = sheet1.getRow(11);

		instructions.forEach((text, i) => {
			const cell = instructionRow.getCell(i + 1);

			cell.value = text;

			cell.font = {
				name: 'Arial',
				size: 10,
				color: { argb: darkBlueText },
			};

			cell.alignment = {
				horizontal: 'center',
				vertical: 'middle',
				wrapText: true,
			};

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: blueBg },
			};
		});

		instructionRow.height = 90;

		/* =====================================================
	   GREY CELLS
	===================================================== */

		const greyCells = [
			'C10',
			'C11',
			'E10',
			'E11',
			'F10',
			'F11',
			'L10',
			'L11',
			'O10',
			'O11',
			'P10',
			'P11',
			'W10',
			'W11',
			'Y10',
			'Y11',
			'AA10',
			'AA11',
			'AB10',
			'AB11',
			'AE10',
			'AE11',
			'AG10',
			'AG11',
			'AH10',
			'AH11',
			'AJ10',
			'AJ11',
			'AN11',
			'AP11',
			'AR9',
			'AR10',
			'AR11',
			'AS9',
			'AS10',
			'AS11',
			'AU10',
			'AU11',
			'AV10',
			'AV11',
			'AY10',
			'AY11',
			'AZ9',
			'AZ10',
			'AZ11',
			'BA9',
			'BA10',
			'BA11',
		];

		greyCells.forEach((addr) => {
			const cell = sheet1.getCell(addr);

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: greyBg },
			};
		});

		/* =====================================================
	   ROW 12 SAMPLE
	===================================================== */

		sheet1.addRow([
			1,
			'The Songs Around',
			'Japan Exclusive',
			'Martin Frank|Robert Green',
			'3453452341241|1235235423',
			'Martin Frank feat. Robert Green',
			'607618113384',
			'GAD 207',
			'Album',
			'',
			'WORLD',
			'US|CA|JP|DE',
			'12/9/2001',
			'Spotify',
			'12/22/2009',
			'A1-2425G-ABC1234002-M',
			'2005',
			'Richard Buongiorno Ltd',
			'2005',
			'Richard Buongiorno Ltd',
			'Celestial Records',
			'Dance',
			'Techno',
			'Electronic',
			'Hardcore',
			'Explicit Content Edited',
			1,
			1,
			1,
			'I Feel Alive',
			'Tony B. Rough Mix',
			'Martin Frank|Robert Green',
			'3453452341241|1235235423',
			'Martin Frank feat. Robert Green',
			'GB-CIA-01-00032',
			'',
			'2005',
			'Martin Frank',
			'Dance',
			'Techno',
			'Electronic',
			'Hardcore',
			'Explicit Content Edited',
			'Richard Cossiant',
			'Christian Blane',
			'Philip Ghunt',
			'Philip Ghunt',
			'RA Ltd.',
			'Y',
			'No human vocals',
			'Y',
			30,
			'2/28/1980',
			'Monetise',
			'',
		]);

		sheet1.getRow(12).eachCell((c) => {
			c.font = {
				name: 'Arial',
				size: 10,
				color: { argb: greyContent },
			};

			c.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: greyText },
			};

			c.alignment = {
				horizontal: 'center',
				vertical: 'middle',
				wrapText: true,
			};
		});

		/* =====================================================
	   ROW 13 COLUMN INDEX
	===================================================== */

		const nums = [];
		for (let i = 1; i <= 55; i++) nums.push(i);

		sheet1.addRow(nums);

		sheet1.getRow(13).eachCell((c) => {
			c.font = {
				name: 'Arial',
				size: 10,
				color: { argb: greyContent },
			};

			c.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: greyText },
			};

			c.alignment = {
				horizontal: 'center',
				vertical: 'middle',
			};
		});

		sheet1.views = [{ state: 'frozen', ySplit: 13 }];
		/* =====================================================
	  WHITE BORDER TABLE
	===================================================== */

		for (let r = 1; r <= 3; r++) {
			for (let c = 1; c <= 8; c++) {
				const cell = sheet1.getCell(r, c);

				cell.border = {
					top: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					left: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					right: { style: 'medium', color: { argb: 'FFFFFFFF' } },
				};
			}
		}

		for (let r = 9; r <= 11; r++) {
			for (let c = 1; c <= 55; c++) {
				const cell = sheet1.getCell(r, c);

				cell.border = {
					top: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					left: { style: 'medium', color: { argb: 'FFFFFFFF' } },
					right: { style: 'medium', color: { argb: 'FFFFFFFF' } },
				};
			}
		}

		/* =====================================================
	   SHEET 2
	===================================================== */

		const sheet2 = workbook.addWorksheet('SYSTEM DATA');

		sheet2.columns = [
			{ header: 'Release type', key: 'releaseType', width: 25 },
			{ header: 'Price', key: 'price', width: 25 },
			{ header: 'Genres', key: 'genres', width: 25 },
			{ header: 'Sensitive content', key: 'sensitive', width: 25 },
			{ header: 'Language', key: 'language', width: 25 },
			{ header: 'Policy', key: 'policy', width: 25 },
			{ header: 'DSP', key: 'dsp', width: 25 },
		];

		const maxLength = Math.max(
			albumFormats.length,
			priceTiers.length,
			genres.length,
			trackSensitives.length,
			languages.length,
			policies.length,
			dsps.length
		);
		const headerRow = sheet2.getRow(1);

		headerRow.eachCell((cell) => {
			cell.font = {
				name: 'Arial Black',
				bold: true,
				size: 11,
			};

			cell.alignment = {
				vertical: 'middle',
				horizontal: 'center',
			};
		});

		for (let i = 0; i < maxLength; i++) {
			sheet2.addRow({
				releaseType: albumFormats[i] || '',
				price: priceTiers[i] || '',
				genres: genres[i] || '',
				sensitive: trackSensitives[i] || '',
				language: languages[i] || '',
				policy: policies[i] || '',
				dsp: dsps[i] || '',
			});
		}

		await sheet2.protect('ant-protect', {
			selectLockedCells: false,
			selectUnlockedCells: false,
		});
		/* =====================================================
	   DROPDOWN LISTS FOR SHEET 1
	===================================================== */

		const startRow = 14;
		const maxRow = 5000;

		/* RANGE FROM SHEET2 */

		const releaseTypeRange = `'SYSTEM DATA'!$A$2:$A$${albumFormats.length + 1}`;
		const priceRange = `'SYSTEM DATA'!$B$2:$B$${priceTiers.length + 1}`;
		const genreRange = `'SYSTEM DATA'!$C$2:$C$${genres.length + 1}`;
		const sensitiveRange = `'SYSTEM DATA'!$D$2:$D$${trackSensitives.length + 1}`;
		const policyRange = `'SYSTEM DATA'!$F$2:$F$${policies.length + 1}`;
		const languageRange = `'SYSTEM DATA'!$E$2:$E$${languages.length + 1}`;
		/* FUNCTION SET DROPDOWN */

		const setDropdown = (col: number, formula: string) => {
			for (let row = startRow; row <= maxRow; row++) {
				sheet1.getCell(row, col).dataValidation = {
					type: 'list',
					allowBlank: true,
					formulae: [formula],
					showErrorMessage: true,
					error: 'Please select a value from the list',
				};
			}
		};

		/* I → RELEASE FORMAT TYPE */
		setDropdown(9, releaseTypeRange);

		/* J → PRICE BAND */
		setDropdown(10, priceRange);

		/* V W X Y → GENRES */
		[22, 23, 24, 25].forEach((col) => {
			setDropdown(col, genreRange);
		});

		/* Z → SENSITIVE CONTENT */
		setDropdown(26, sensitiveRange);

		/* AM AN AO AP → GENRES */
		[39, 40, 41, 42].forEach((col) => {
			setDropdown(col, genreRange);
		});

		/* AY → Y / N */

		for (let row = startRow; row <= maxRow; row++) {
			sheet1.getCell(row, 51).dataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: ['"Y,N"'],
			};
		}

		/* AW → Y / N */
		for (let row = startRow; row <= maxRow; row++) {
			sheet1.getCell(row, 49).dataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: ['"Y,N"'],
			};
		}

		/* AX → LANGUAGE */
		setDropdown(50, languageRange);

		/* BB → POLICY */

		setDropdown(54, policyRange);
		/* =====================================================
	   DOWNLOAD
	===================================================== */

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		);

		res.setHeader(
			'Content-Disposition',
			'attachment; filename=ant-template.xlsx',
		);

		await workbook.xlsx.write(res);

		res.end();
	}
}
