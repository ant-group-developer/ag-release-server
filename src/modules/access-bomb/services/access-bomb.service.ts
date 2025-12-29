// src/access-bomb/access-bomb.service.ts
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';

import { existsSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

import * as fs from 'fs';
import * as path from 'path';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as unzipper from 'unzipper';
import * as XLSX from 'xlsx';
import XlsxPopulate from 'xlsx-populate';
import { ReleaseMetadata } from '../entities/metadata.entity';
import { CI_COLUMN_MAP, CiRawRow } from '../interface/interface';

type BombRow = {
	releaseId: string;
	upc: string;
	discNumber?: number;
	trackNumber: number;
	trackTitle: string;
	trackTitleVersion?: string;
	trackArtist: string;
	trackISRC: string;
	albumArtist: string;
	albumTitle: string;
	albumTitleVersion?: string;
	releaseType: string;
	label: string;
	originalReleaseDate: string;
	category: string;
	pLineYear: string;
	pLineText: string;
	cLineYear: string;
	cLineText: string;
	territories: string;
};

@Injectable()
export class AccessBombService {
	constructor(
		private readonly http: HttpService,

		@InjectRepository(ReleaseMetadata)
		private readonly metadataReleaseRepo: Repository<ReleaseMetadata>,
	) {}

	async getListMetadataReleases() {
		return this.metadataReleaseRepo.find({
			order: { releaseId: 'DESC', trackNumber: 'ASC' },
		});
	}

	private headers(token: string) {
		return {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			Origin: 'https://bombshelter.revelator.pro',
		};
	}

	async getReleaseList(token: string) {
		const { data } = await firstValueFrom(
			this.http.get('https://api.revelator.com/content/release/all', {
				headers: this.headers(token),
				params: {
					archived: false,
					orderByDescending: true,
					orderByProperty: 'releaseDate',
					pageNumber: 1,
					pageSize: 1000,
					additionalCounters: false,
					'releaseTypes[0]': 1,
					'releaseTypes[1]': 2,
					'releaseTypes[2]': 4,
					'releaseTypes[3]': 6,
				},
			}),
		);

		return {
			totalItemsCount: data.totalItemsCount,
			pageNumber: data.pageNumber,
			pageSize: data.pageSize,
			items: data.items.map((i: any) => ({
				releaseId: i.releaseId,
			})),
		};
	}

	async downloadRelease(token: string, releaseId: number) {
		const res = await firstValueFrom(
			this.http.get(
				'https://api.revelator.com/content/release/downloadReleaseAssets',
				{
					headers: this.headers(token),
					params: { releaseId },
					responseType: 'stream',
				},
			),
		);

		const dir = join(process.cwd(), 'downloads');
		await mkdir(dir, { recursive: true });

		const filePath = join(dir, `${releaseId}.zip`);
		const writeStream = createWriteStream(filePath);

		await pipeline(res.data, writeStream);
		return {
			releaseId,
			path: filePath,
		};
	}

	async bulkDownload(token: string) {
		const list = await this.getReleaseList(token);
		const concurrency = 20;
		const items: { releaseId: number }[] = list.items;

		let done = 0;
		let fail = 0;
		let processed = 0;

		for (let i = 0; i < items.length; i += concurrency) {
			const batch = items.slice(i, i + concurrency);

			await Promise.all(
				batch.map(async (item) => {
					const filePath = `${process.cwd()}/downloads/${item.releaseId}.zip`;

					if (existsSync(filePath)) {
						done++;
						processed++;
						console.log(
							`[SKIP ${done}/${items.length}] releaseId=${item.releaseId}`,
						);
						return;
					}

					try {
						await this.retry(
							() => this.downloadRelease(token, item.releaseId),
							5,
							3000,
						);
						done++;
						processed++;
						console.log(
							`[DONE ${done}/${items.length}] releaseId=${item.releaseId}`,
						);
					} catch (e: any) {
						fail++;
						processed++;
						console.error(
							`[FAIL ${fail}] releaseId=${item.releaseId} ${e?.code || e}`,
						);
					}
				}),
			);

			if (processed >= 30) {
				processed = 0;
				console.log('[PAUSE] cooldown 5s');
				await sleep(5000);
			}
		}

		return {
			total: items.length,
			done,
			fail,
			status: 'finished',
		};
	}

	async retry<T>(
		fn: () => Promise<T>,
		retry = 5,
		delayMs = 3000,
	): Promise<T> {
		try {
			return await fn();
		} catch (e: any) {
			if (
				retry <= 0 ||
				!['ECONNRESET', 'ETIMEDOUT', 'aborted'].includes(e?.code)
			) {
				throw e;
			}
			await sleep(delayMs);
			return this.retry(fn, retry - 1, delayMs * 1.5);
		}
	}

	// async runParseBatchesFromBombFile(
	// 	bombFilePath: string,
	// 	templatePath: string,
	// 	batchSize: number,
	// ) {
	// 	console.log('[JOB_START]', { bombFilePath, templatePath, batchSize });

	// 	const bombRows = this.loadBombFile(bombFilePath);
	// 	console.log('[BOMB_LOADED]', { rows: bombRows.length });

	// 	const upcs = Array.from(new Set(bombRows.map((r) => r.upc)));
	// 	console.log('[UPC_COUNT]', upcs.length);

	// 	const batches: string[] = [];

	// 	for (let i = 0; i < upcs.length; i += batchSize) {
	// 		const batchUpcs = upcs.slice(i, i + batchSize);
	// 		const batchId = this.generateBatchId();

	// 		console.log('[BATCH_START]', {
	// 			batchId,
	// 			from: i,
	// 			to: i + batchUpcs.length,
	// 		});

	// 		await this.parseBatch({
	// 			batchId,
	// 			bombRows,
	// 			upcs: batchUpcs,
	// 			templatePath,
	// 		});
	// 		console.log('[BATCH_DONE]', { batchId });
	// 		batches.push(batchId);
	// 	}

	// 	console.log('[JOB_DONE]', { batchCount: batches.length });
	// 	return { batches };
	// }

	// private async parseBatch({
	// 	batchId,
	// 	bombRows,
	// 	upcs,
	// 	templatePath,
	// }: {
	// 	batchId: string;
	// 	bombRows: BombRow[];
	// 	upcs: string[];
	// 	templatePath: string;
	// }) {
	// 	const baseImport = path.resolve('import', batchId);
	// 	const downloads = path.resolve('downloads');
	// 	const tmpRoot = path.resolve('tmp');
	// 	fs.mkdirSync(baseImport, { recursive: true });
	// 	fs.mkdirSync(tmpRoot, { recursive: true });

	// 	console.log('[PARSE_BATCH]', {
	// 		batchId,
	// 		releaseCount: upcs.length,
	// 	});

	// 	for (const upc of upcs) {
	// 		const rows = bombRows.filter((r) => r.upc === upc);

	// 		console.log('[RELEASE_START]', {
	// 			batchId,
	// 			upc,
	// 			tracks: rows.length,
	// 			releaseId: rows[0]?.releaseId,
	// 		});

	// 		await this.parseRelease({
	// 			upc,
	// 			rows,
	// 			templatePath,
	// 			downloads,
	// 			baseImport,
	// 			tmpRoot,
	// 		});

	// 		console.log('[RELEASE_DONE]', { batchId, upc });
	// 	}
	// }

	// private async parseRelease(input: {
	// 	upc: string;
	// 	rows: BombRow[];
	// 	templatePath: string;
	// 	downloads: string;
	// 	baseImport: string;
	// 	tmpRoot: string;
	// }) {
	// 	const { upc, rows, templatePath, downloads, baseImport, tmpRoot } =
	// 		input;

	// 	const releaseId = rows[0].releaseId;
	// 	const releaseDir = path.join(baseImport, upc);
	// 	const tmpDir = path.join(tmpRoot, releaseId);

	// 	console.log('[PARSE_RELEASE]', { upc, releaseId });

	// 	fs.mkdirSync(releaseDir, { recursive: true });
	// 	fs.mkdirSync(tmpDir, { recursive: true });

	// 	const zipPath = path.join(downloads, `${releaseId}.zip`);
	// 	console.log('[UNZIP_START]', zipPath);

	// 	// Unzip asset
	// 	await fs
	// 		.createReadStream(zipPath)
	// 		.pipe(unzipper.Extract({ path: tmpDir }))
	// 		.promise();

	// 	console.log('[UNZIP_DONE]', tmpDir);

	// 	const files = fs.readdirSync(tmpDir);
	// 	console.log('[TMP_FILES_COUNT]', files.length);

	// 	// ===== COPY IMAGE =====
	// 	const image = files.find((f) => /\.(jpg|png|tif)$/i.test(f));
	// 	if (image) {
	// 		fs.copyFileSync(
	// 			path.join(tmpDir, image),
	// 			path.join(releaseDir, `${upc}${path.extname(image)}`),
	// 		);
	// 		console.log('[IMAGE_COPIED]', image);
	// 	} else {
	// 		console.warn('[IMAGE_NOT_FOUND]', { upc, releaseId });
	// 	}

	// 	// ===== COPY AUDIO FILES (FIXED) =====
	// 	const audioFiles = files
	// 		.filter((f) => /\.(wav|flac|aiff)$/i.test(f))
	// 		.sort(); // Sort để đảm bảo thứ tự ổn định

	// 	console.log('[AUDIO_FILES_FOUND]', audioFiles.length);

	// 	if (audioFiles.length !== rows.length) {
	// 		console.warn('[AUDIO_TRACK_MISMATCH]', {
	// 			upc,
	// 			audioCount: audioFiles.length,
	// 			trackCount: rows.length,
	// 		});
	// 	}

	// 	for (const [index, r] of rows.entries()) {
	// 		const audio = audioFiles[index];
	// 		if (!audio) {
	// 			console.error('[MISSING_AUDIO]', {
	// 				upc,
	// 				disc: r.discNumber,
	// 				track: r.trackNumber,
	// 			});
	// 			continue;
	// 		}

	// 		const vol = String(r.discNumber ?? 1).padStart(2, '0');
	// 		const trk = String(r.trackNumber).padStart(2, '0');

	// 		const targetAudioPath = path.join(
	// 			releaseDir,
	// 			`${upc}_${vol}_${trk}${path.extname(audio)}`,
	// 		);

	// 		fs.copyFileSync(path.join(tmpDir, audio), targetAudioPath);
	// 		console.log('[AUDIO_COPIED]', {
	// 			src: audio,
	// 			dst: path.basename(targetAudioPath),
	// 		});
	// 	}

	// 	// ===== CREATE CI METADATA FILE (FIXED - DÙNG XLSX-POPULATE) =====
	// 	const targetExcelPath = path.join(releaseDir, `${upc}.xlsx`);

	// 	console.log('[COPY_TEMPLATE_START]');
	// 	fs.copyFileSync(templatePath, targetExcelPath);
	// 	console.log('[COPY_TEMPLATE_DONE]');

	// 	console.log('[WRITE_METADATA_START]');
	// 	const workbook = await XlsxPopulate.fromFileAsync(targetExcelPath);
	// 	const sheet = workbook.sheet('METADATA TEMPLATE');

	// 	if (!sheet) {
	// 		throw new Error('SHEET_NOT_FOUND: METADATA TEMPLATE');
	// 	}

	// 	const START_ROW = 15;

	// 	rows.forEach((r, i) => {
	// 		const rowNum = START_ROW + i;

	// 		// Map theo đúng cột CI template (A-Q + cột excluded territories nếu có)
	// 		sheet.cell(`A${rowNum}`).value(r.releaseType);
	// 		sheet.cell(`B${rowNum}`).value(r.upc);
	// 		sheet.cell(`C${rowNum}`).value(r.albumArtist);
	// 		sheet.cell(`D${rowNum}`).value(r.albumTitle);
	// 		sheet.cell(`E${rowNum}`).value(r.albumTitleVersion);
	// 		sheet.cell(`F${rowNum}`).value(r.trackTitle);
	// 		sheet.cell(`G${rowNum}`).value(r.trackTitleVersion);
	// 		sheet.cell(`H${rowNum}`).value(r.trackArtist);
	// 		sheet.cell(`I${rowNum}`).value(r.trackISRC);
	// 		sheet.cell(`J${rowNum}`).value(r.label);
	// 		sheet.cell(`K${rowNum}`).value(r.category);
	// 		sheet.cell(`L${rowNum}`).value(r.territories);
	// 		sheet.cell(`M${rowNum}`).value(r.originalReleaseDate);
	// 		sheet.cell(`N${rowNum}`).value(r.pLineYear);
	// 		sheet.cell(`O${rowNum}`).value(r.pLineText);
	// 		sheet.cell(`P${rowNum}`).value(r.cLineYear);
	// 		sheet.cell(`Q${rowNum}`).value(r.cLineText);

	// 		// Nếu CI template có cột excluded territories, thêm vào đây
	// 		// (Kiểm tra ảnh CI để xác định đúng cột, ví dụ AA)
	// 		// sheet.cell(`AA${rowNum}`).value(r.excludedTerritories);
	// 	});

	// 	await workbook.toFileAsync(targetExcelPath);
	// 	console.log('[EXCEL_DONE]', targetExcelPath);

	// 	// Clean up tmp
	// 	fs.rmSync(tmpDir, { recursive: true, force: true });
	// 	console.log('[TMP_CLEANED]', tmpDir);
	// }

	// private generateBatchId(): string {
	// 	return Date.now().toString();
	// }

	// private loadBombFile(filePath: string): BombRow[] {
	// 	const wb = XLSX.readFile(filePath);
	// 	const sheet = wb.Sheets[wb.SheetNames[0]];
	// 	const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

	// 	return rows.map((r) => ({
	// 		releaseId: String(r['ReleaseId']),
	// 		upc: String(r['AlbumUPC']),
	// 		discNumber: Number(r['DiscNumber'] || 1),
	// 		trackNumber: Number(r['TrackNumber']),
	// 		trackTitle: r['TrackTitle'],
	// 		trackTitleVersion: r['TrackTitleVersion'],
	// 		trackArtist: r['TrackArtist'],
	// 		trackISRC: r['TrackISRC'],
	// 		albumArtist: r['AlbumArtist'],
	// 		albumTitle: r['AlbumTitle'],
	// 		albumTitleVersion: r['AlbumTitleVersion'],
	// 		releaseType: r['AlbumPriceCode'],
	// 		label: r['Label'],
	// 		originalReleaseDate: r['OriginalReleaseDate'],
	// 		category: r['Category'],
	// 		pLineYear: r['PLineYear'],
	// 		pLineText: r['PLineText'],
	// 		cLineYear: r['CLineYear'],
	// 		cLineText: r['CLineText'],
	// 		territories: r['Territories'],
	// 		excludedTerritories: r['ExcludedTerritories'],
	// 		trackFileName: r['TrackFileName'],
	// 		duration: r['Duration'],
	// 	}));
	// }

	/**
	 * =================================================================
	 * ENTRY POINT: Chạy toàn bộ pipeline
	 * =================================================================
	 * Input:
	 *  - bombFilePath: Đường dẫn file BOMB (excel/csv)
	 *  - templatePath: Đường dẫn file template CI gốc (.xlsx)
	 *  - batchSize: Số UPC mỗi batch (thường = 10)
	 *
	 * Output:
	 *  - Tạo thư mục import/batch_xxx/ với nhiều batch
	 *  - Mỗi batch chứa 10 thư mục UPC
	 *
	 * Pipeline:
	 *  1. Load file BOMB → lấy danh sách UPC
	 *  2. Chia thành batches (mỗi batch = 10 UPC)
	 *  3. Xử lý từng batch → từng release → asset + metadata
	 * =================================================================
	 */
	async runParseBatchesFromBombFile(
		bombFilePath: string,
		templatePath: string,
		batchSize: number,
	) {
		console.log('[JOB_START]', { bombFilePath, templatePath, batchSize });

		// BƯỚC 1: Load toàn bộ file BOMB vào memory
		const bombRows = this.loadBombFile(bombFilePath);
		console.log('[BOMB_LOADED]', { rows: bombRows.length });

		// BƯỚC 2: Lấy danh sách UPC UNIQUE (vì nhiều track cùng 1 UPC)
		// VD: 8000 dòng → có thể chỉ 700 UPC
		const upcs = Array.from(new Set(bombRows.map((r) => r.upc)));
		console.log('[UPC_COUNT]', upcs.length);

		const batches: string[] = [];

		// BƯỚC 3: Chia UPC thành batches (mỗi batch = 10 UPC)
		for (let i = 0; i < upcs.length; i += batchSize) {
			const batchUpcs = upcs.slice(i, i + batchSize);
			const batchId = this.generateBatchId(); // Sinh ID dựa trên timestamp

			console.log('[BATCH_START]', {
				batchId,
				from: i,
				to: i + batchUpcs.length,
			});

			// Xử lý batch này
			await this.parseBatch({
				batchId,
				bombRows,
				upcs: batchUpcs,
				templatePath,
			});

			console.log('[BATCH_DONE]', { batchId });
			batches.push(batchId);
		}

		console.log('[JOB_DONE]', { batchCount: batches.length });
		return { batches };
	}

	/**
	 * =================================================================
	 * Xử lý 1 BATCH (10 UPC)
	 * =================================================================
	 * Tạo cấu trúc:
	 *   import/batch_xxx/
	 *     ├─ UPC_1/
	 *     ├─ UPC_2/
	 *     └─ ...
	 *
	 * Loop qua từng UPC trong batch và gọi parseRelease()
	 * =================================================================
	 */
	private async parseBatch({
		batchId,
		bombRows,
		upcs,
		templatePath,
	}: {
		batchId: string;
		bombRows: BombRow[];
		upcs: string[];
		templatePath: string;
	}) {
		// Định nghĩa đường dẫn
		const baseImport = path.resolve('import', batchId); // Thư mục batch
		const downloads = path.resolve('downloads'); // Thư mục chứa zip từ BOMB
		const tmpRoot = path.resolve('tmp'); // Thư mục tạm để giải nén

		// Tạo thư mục nếu chưa có
		fs.mkdirSync(baseImport, { recursive: true });
		fs.mkdirSync(tmpRoot, { recursive: true });

		console.log('[PARSE_BATCH]', {
			batchId,
			releaseCount: upcs.length,
		});

		// Xử lý từng UPC (= 1 release)
		for (const upc of upcs) {
			// Filter tất cả track thuộc UPC này
			const rows = bombRows.filter((r) => r.upc === upc);

			console.log('[RELEASE_START]', {
				batchId,
				upc,
				tracks: rows.length,
				releaseId: rows[0]?.releaseId, // ReleaseId để tìm zip
			});

			try {
				await this.parseRelease({
					upc,
					rows,
					templatePath,
					downloads,
					baseImport,
					tmpRoot,
				});

				console.log('[RELEASE_DONE]', { batchId, upc });
			} catch (error) {
				// Nếu 1 release lỗi, log nhưng KHÔNG crash toàn bộ batch
				console.error('[RELEASE_ERROR]', {
					batchId,
					upc,
					error: error.message,
				});
			}
		}
	}

	private async parseRelease(input: {
		upc: string;
		rows: BombRow[];
		templatePath: string;
		downloads: string;
		baseImport: string;
		tmpRoot: string;
	}) {
		const { upc, rows, templatePath, downloads, baseImport, tmpRoot } =
			input;

		const releaseId = rows[0].releaseId;
		const releaseDir = path.join(baseImport, upc);
		const tmpDir = path.join(tmpRoot, releaseId);

		console.log('[PARSE_RELEASE]', { upc, releaseId });

		this.ensureDirs(releaseDir, tmpDir);

		const files = await this.extractBombZip(releaseId, downloads, tmpDir);

		this.handleImage(files, tmpDir, releaseDir, upc);
		this.handleAudios(files, tmpDir, releaseDir, upc, rows);
		await this.handleCiExcel(releaseDir, upc, rows, templatePath);

		this.cleanupTmp(tmpDir);
	}

	/**
	 * =========================
	 * FS / DIR
	 * =========================
	 */
	private ensureDirs(releaseDir: string, tmpDir: string) {
		fs.mkdirSync(releaseDir, { recursive: true });
		fs.mkdirSync(tmpDir, { recursive: true });
	}

	private cleanupTmp(tmpDir: string) {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
			console.log('[TMP_CLEANED]', tmpDir);
		} catch {
			console.warn('[TMP_CLEANUP_FAILED]', tmpDir);
		}
	}

	/**
	 * =========================
	 * ZIP
	 * =========================
	 */
	private async extractBombZip(
		releaseId: string,
		downloads: string,
		tmpDir: string,
	): Promise<string[]> {
		const zipPath = path.join(downloads, `${releaseId}.zip`);
		console.log('[UNZIP_START]', zipPath);

		if (!fs.existsSync(zipPath)) {
			throw new Error(`ZIP_NOT_FOUND: ${zipPath}`);
		}

		await fs
			.createReadStream(zipPath)
			.pipe(unzipper.Extract({ path: tmpDir }))
			.promise();

		console.log('[UNZIP_DONE]', tmpDir);

		const files = fs.readdirSync(tmpDir);
		console.log('[TMP_FILES_COUNT]', files.length);

		return files;
	}

	/**
	 * =========================
	 * IMAGE
	 * =========================
	 */
	private handleImage(
		files: string[],
		tmpDir: string,
		releaseDir: string,
		upc: string,
	) {
		const image = files.find((f) => /\.(jpg|png|tif)$/i.test(f));

		if (!image) {
			console.warn('[IMAGE_NOT_FOUND]', upc);
			return;
		}

		const target = path.join(releaseDir, `${upc}${path.extname(image)}`);
		fs.copyFileSync(path.join(tmpDir, image), target);

		console.log('[IMAGE_COPIED]', target);
	}

	/**
	 * =========================
	 * AUDIO
	 * =========================
	 */
	private handleAudios(
		files: string[],
		tmpDir: string,
		releaseDir: string,
		upc: string,
		rows: BombRow[],
	) {
		const audioFiles = files
			.filter((f) => /\.(wav|flac|aiff)$/i.test(f))
			.sort();

		console.log('[AUDIO_FILES]', { count: audioFiles.length });

		if (audioFiles.length !== rows.length) {
			console.warn('[AUDIO_MISMATCH]', {
				upc,
				audioCount: audioFiles.length,
				trackCount: rows.length,
			});
		}

		for (const [index, r] of rows.entries()) {
			const audio = audioFiles[index];
			if (!audio) {
				console.error('[MISSING_AUDIO]', {
					upc,
					disc: r.discNumber,
					track: r.trackNumber,
				});
				continue;
			}

			const vol = String(r.discNumber ?? 1).padStart(2, '0');
			const trk = String(r.trackNumber).padStart(2, '0');

			const target = path.join(
				releaseDir,
				`${upc}_${vol}_${trk}${path.extname(audio)}`,
			);

			fs.copyFileSync(path.join(tmpDir, audio), target);

			console.log('[AUDIO_COPIED]', {
				from: audio,
				to: path.basename(target),
			});
		}
	}

	/**
	 * =========================
	 * CI EXCEL
	 * =========================
	 */
	private async handleCiExcel(
		releaseDir: string,
		upc: string,
		rows: BombRow[],
		templatePath: string,
	) {
		const targetExcelPath = path.join(releaseDir, `${upc}.xlsx`);
		console.log('[EXCEL_START]', targetExcelPath);

		fs.copyFileSync(templatePath, targetExcelPath);

		const workbook = await XlsxPopulate.fromFileAsync(targetExcelPath);
		const sheet = workbook.sheet('METADATA TEMPLATE');
		if (!sheet) throw new Error('SHEET_NOT_FOUND');

		this.mapRowsToCiSheet(sheet, rows);

		await workbook.toFileAsync(targetExcelPath);
		console.log('[EXCEL_DONE]', targetExcelPath);
	}

	private mapRowsToCiSheet(sheet: any, rows: BombRow[]) {
		const START_ROW = 15;

		rows.forEach((r, i) => {
			const row = START_ROW + i;

			sheet.cell(`A${row}`).value(r.releaseType);
			sheet.cell(`B${row}`).value(r.upc);
			sheet.cell(`C${row}`).value(r.albumArtist);
			sheet.cell(`D${row}`).value(r.albumTitle);
			sheet.cell(`E${row}`).value(r.albumTitleVersion);
			sheet.cell(`F${row}`).value(r.trackTitle);
			sheet.cell(`G${row}`).value(r.trackTitleVersion);
			sheet.cell(`H${row}`).value(r.trackArtist);
			sheet.cell(`I${row}`).value(r.trackISRC);
			sheet.cell(`J${row}`).value(r.label);
			sheet.cell(`K${row}`).value(r.category);
			sheet.cell(`L${row}`).value(r.territories);
			sheet.cell(`M${row}`).value(r.originalReleaseDate);
			sheet.cell(`N${row}`).value(r.pLineYear);
			sheet.cell(`O${row}`).value(r.pLineText);
			sheet.cell(`P${row}`).value(r.cLineYear);
			sheet.cell(`Q${row}`).value(r.cLineText);
		});
	}

	/**
	 * Sinh batch ID dựa trên timestamp
	 * VD: 1735012345678
	 */
	private generateBatchId(): string {
		return Date.now().toString();
	}

	/**
	 * =================================================================
	 * Load BOMB file (Excel/CSV) thành array of BombRow
	 * =================================================================
	 * Sử dụng SheetJS (XLSX) để đọc file
	 *
	 * Input: Đường dẫn file BOMB (.xlsx hoặc .csv)
	 * Output: Array of BombRow (mỗi dòng = 1 track)
	 *
	 * Note:
	 *  - defval: '' → cell rỗng sẽ trả về string rỗng thay vì undefined
	 *  - Mapping key name từ BOMB → interface BombRow
	 * =================================================================
	 */
	private loadBombFile(filePath: string): BombRow[] {
		// Đọc file excel/csv
		const wb = XLSX.readFile(filePath);

		// Lấy sheet đầu tiên
		const sheet = wb.Sheets[wb.SheetNames[0]];

		// Convert sheet → JSON array
		const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

		// Map từng row thành BombRow interface
		return rows.map((r) => ({
			// BOMB fields
			releaseId: String(r['ReleaseId']), // Dùng để tìm zip
			upc: String(r['AlbumUPC']), // CI identity
			discNumber: Number(r['DiscNumber'] || 1), // Default = 1
			trackNumber: Number(r['TrackNumber']),

			// Track metadata
			trackTitle: r['TrackTitle'],
			trackTitleVersion: r['TrackTitleVersion'],
			trackArtist: r['TrackArtist'],
			trackISRC: r['TrackISRC'],

			// Album metadata
			albumArtist: r['AlbumArtist'],
			albumTitle: r['AlbumTitle'],
			albumTitleVersion: r['AlbumTitleVersion'],
			releaseType: r['AlbumPriceCode'],

			// Label & distribution
			label: r['Label'],
			originalReleaseDate: r['OriginalReleaseDate'],
			category: r['Category'],

			// Copyright
			pLineYear: r['PLineYear'],
			pLineText: r['PLineText'],
			cLineYear: r['CLineYear'],
			cLineText: r['CLineText'],

			// Territories
			territories: r['Territories'],
			excludedTerritories: r['ExcludedTerritories'],

			// Other fields (không dùng trong CI nhưng có trong BOMB)
			trackFileName: r['TrackFileName'],
			duration: r['Duration'],
		}));
	}

	//
	async buildCiExcel(input: {
		templatePath: string;
		outputPath: string;
		rows: CiRawRow[];
	}) {
		const { templatePath, outputPath, rows } = input;

		fs.copyFileSync(templatePath, outputPath);

		const workbook = await XlsxPopulate.fromFileAsync(outputPath);
		const sheet = workbook.sheet('METADATA TEMPLATE');
		if (!sheet) throw new Error('SHEET_NOT_FOUND');

		const START_ROW = 15;

		rows.forEach((r, i) => {
			const row = START_ROW + i;
			(Object.keys(CI_COLUMN_MAP) as (keyof CiRawRow)[]).forEach(
				(key) => {
					const col = CI_COLUMN_MAP[key];
					const val = r[key];
					if (val === undefined) return;
					sheet.cell(`${col}${row}`).value(val === null ? '' : val);
				},
			);
		});

		await workbook.toFileAsync(outputPath);
	}
}
