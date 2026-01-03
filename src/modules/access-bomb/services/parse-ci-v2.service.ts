// service
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import os from 'os';
import pLimit from 'p-limit';
import * as path from 'path';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import * as unzipper from 'unzipper';
import * as XLSX from 'xlsx';
import XlsxPopulate from 'xlsx-populate';
import { GENRE_MAPPING, LANGUAGE_MAPPING } from '../const/const';
import { Release } from '../entities/metadata.entity';
import {
	Release_29_12,
	ReleaseBombAll,
	TrackBombAll,
} from '../entities/metadata.entity.29-12';
import { ReleaseCi } from '../entities/release-ci.entity';
import {
	CI_COLUMN_MAP,
	CiRawRow,
	ReleaseDetailAll,
	TrackDetailAll,
} from '../interface/interface';

@Injectable()
export class ParseDataCiService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(ReleaseCi)
		private readonly releaseCiRepo: Repository<ReleaseCi>,

		@InjectRepository(Release_29_12)
		private readonly release_29_12_Repo: Repository<Release_29_12>,

		@InjectRepository(TrackBombAll)
		private readonly trackBombAllRepo: Repository<TrackBombAll>,

		@InjectRepository(ReleaseBombAll)
		private readonly releaseBombAllRepo: Repository<ReleaseBombAll>,
	) {}

	async getTrackDetail(id: number): Promise<TrackDetailAll> {
		const data = await this.trackBombAllRepo.findOne({ where: { id } });
		if (!data) throw new NotFoundException('TRACK_NOT_FOUND');
		return data.response;
	}

	async getReleaseDetail(id: number): Promise<ReleaseDetailAll> {
		const data = await this.releaseBombAllRepo.findOne({ where: { id } });
		if (!data) throw new NotFoundException('RELEASE_NOT_FOUND');
		return data.response;
	}

	async getRelease(filter: { releaseId?: number; label?: string }) {
		const qb = this.releaseRepo
			.createQueryBuilder('r')
			.leftJoinAndSelect('r.tracks', 't')
			.orderBy('r.release_id', 'DESC')
			.addOrderBy('t.track_number', 'ASC');

		if (filter.releaseId) {
			qb.andWhere('r.release_id = :releaseId', {
				releaseId: filter.releaseId,
			});
		}

		if (filter.label) {
			qb.andWhere('r.label ILIKE :label', {
				label: `%${filter.label}%`,
			});
		}

		return qb.getMany();
	}

	async findOne(id: number) {
		const releaseCi = await this.release_29_12_Repo.findOne({
			where: { id },
			relations: ['trackCis'],
		});

		if (!releaseCi) {
			throw new NotFoundException('Release not found');
		}

		return releaseCi;
	}

	async findOneByUpc(upc: string) {
		const releaseCi = await this.release_29_12_Repo.findOne({
			where: { gtin: upc },
			// relations: ['trackCis'],
		});

		if (!releaseCi) {
			throw new NotFoundException('Release not found');
		}

		return releaseCi;
	}

	// async parseAllReleases(ciOrderId: string) {
	// 	const releases = await this.release_29_12_Repo.find({
	// 		select: ['id'],
	// 	});

	// 	const total = releases.length;
	// 	let processed = 0;
	// 	const totalStart = Date.now();

	// 	console.log(`[PARSE_ALL_START] total=${total}\n`);

	// 	for (const r of releases) {
	// 		const start = Date.now();

	// 		await this.parseRelease(r.id, ciOrderId);

	// 		processed++;
	// 		const durationMs = Date.now() - start;
	// 		const elapsedMs = Date.now() - totalStart;

	// 		console.log(
	// 			`[PARSE_RELEASE_DONE] ${processed}/${total} releaseId=${r.id} time=${(durationMs / 1000).toFixed(2)}s`,
	// 		);
	// 		console.log(
	// 			`[PARSE_PROGRESS] elapsed=${(elapsedMs / 1000).toFixed(2)}s`,
	// 		);
	// 		console.log('\n'); // xuống dòng cho dễ nhìn
	// 	}

	// 	const totalDurationMs = Date.now() - totalStart;

	// 	console.log(
	// 		`[PARSE_ALL_DONE] total=${total} time=${(totalDurationMs / 1000).toFixed(2)}s`,
	// 	);
	// }

	async parseAllReleases(ciOrderId: string) {
		const releases = await this.release_29_12_Repo.find({
			select: ['id'],
		});

		const total = releases.length;
		const cpu = os.cpus().length;
		const limit = pLimit(cpu - 1);

		console.log(cpu - 1);

		let processed = 0;
		const totalStart = Date.now();

		console.log(
			`[PARSE_ALL_START] total=${total} concurrency=${cpu - 1}\n`,
		);

		await Promise.all(
			releases.map((r) =>
				limit(async () => {
					const start = Date.now();

					await this.parseRelease(r.id, ciOrderId);

					processed++;
					const durationMs = Date.now() - start;
					const elapsedMs = Date.now() - totalStart;

					console.log(
						`[PARSE_RELEASE_DONE] ${processed}/${total} releaseId=${r.id} time=${(
							durationMs / 1000
						).toFixed(2)}s`,
					);
					console.log(
						`[PARSE_PROGRESS] elapsed=${(elapsedMs / 1000).toFixed(2)}s`,
					);
					console.log('');
				}),
			),
		);

		const totalDurationMs = Date.now() - totalStart;

		console.log(
			`[PARSE_ALL_DONE] total=${total} time=${(
				totalDurationMs / 1000
			).toFixed(2)}s`,
		);
	}

	async parseReleaseByUpc(id: string, ciOrderId: string) {
		const release = await this.findOneByUpc(id);
		await this.parseRelease(release.id, ciOrderId);
	}

	async parseRelease(id: number, ciOrderId: string) {
		console.log('[RELEASE]', { id, ciOrderId });

		const release = await this.findOne(id);
		const upc = release.gtin;

		if (!upc) {
			console.log('Skip release (no UPC):', id);
			return;
		}

		const downloadDir = path.resolve('downloads');
		const unzipDir = path.resolve('download_unzip');

		const outputRoot = path.resolve('release_parsed', ciOrderId);

		const templatePath = path.resolve(
			'src/modules/access-bomb/file/file-ci.xlsx',
		);

		const zipPath = path.join(downloadDir, `${id}.zip`);
		if (!fs.existsSync(zipPath)) {
			throw new Error(`ZIP_NOT_FOUND: ${zipPath}`);
		}

		const tmpDir = path.join(unzipDir, String(id));
		const releaseDir = path.join(outputRoot, upc);

		fs.mkdirSync(tmpDir, { recursive: true });
		fs.mkdirSync(releaseDir, { recursive: true });

		/* =========================
	   1. UNZIP
	========================= */
		await fs
			.createReadStream(zipPath)
			.pipe(unzipper.Extract({ path: tmpDir }))
			.promise();

		const files = fs.readdirSync(tmpDir);

		/* =========================
	   2. COVER IMAGE
	========================= */
		await this.copyAndNormalizeReleaseImage({
			files,
			tmpDir,
			releaseDir,
			upc,
		});

		/* =========================
	   3. AUDIO FILES
	========================= */
		const audioFiles = files.filter((f) => /\.(wav|flac|aiff)$/i.test(f));

		release.trackCis
			.sort((a, b) => a.trackNo - b.trackNo)
			.forEach((t) => {
				if (!t.trackFileName) {
					console.warn(`Track ${t.trackNo} không có trackFileName`);
					return;
				}

				const audio = audioFiles.find((f) => f === t.trackFileName);

				if (!audio) {
					console.warn(
						`Không tìm thấy audio cho track ${t.trackNo}: ${t.trackFileName}`,
					);
					return;
				}

				const trk = String(t.trackNo).padStart(2, '0');

				fs.copyFileSync(
					path.join(tmpDir, audio),
					path.join(
						releaseDir,
						`${upc}_01_${trk}${path.extname(audio)}`,
					),
				);
			});

		/* =========================
	   4. CI EXCEL
	========================= */
		const rows = this.parseCiRawRowsFromRelease(release);

		await this.buildCiExcel({
			templatePath,
			outputPath: path.join(releaseDir, `${upc}.xlsx`),
			rows,
		});

		/* =========================
	   5. CLEAN TMP
	========================= */
		await this.safeRemoveDir(tmpDir);

		console.log('[DONE]', {
			ciOrderId,
			upc,
			output: releaseDir,
		});
	}

	// async parseRelease(id: number, ciOrderId: string) {
	// 	console.log('[RELEASE]', { id, ciOrderId });

	// 	const release = await this.findOne(id);
	// 	const upc = release.gtin;

	// 	if (!upc) {
	// 		console.log('Skip release (no UPC):', id);
	// 		return;
	// 	}

	// 	const downloadDir = path.resolve('downloads');
	// 	const unzipDir = path.resolve('download_unzip');
	// 	const outputRoot = path.resolve('release_parsed', ciOrderId);

	// 	const templatePath = path.resolve(
	// 		'src/modules/access-bomb/file/file-ci.xlsx',
	// 	);

	// 	const zipPath = path.join(downloadDir, `${id}.zip`);
	// 	if (!fs.existsSync(zipPath)) {
	// 		throw new Error(`ZIP_NOT_FOUND: ${zipPath}`);
	// 	}

	// 	const tmpDir = path.join(unzipDir, String(id));
	// 	const releaseDir = path.join(outputRoot, upc);

	// 	await fs.promises.mkdir(tmpDir, { recursive: true });
	// 	await fs.promises.mkdir(releaseDir, { recursive: true });

	// 	/* =========================
	//    1. UNZIP
	// ========================= */
	// 	await fs
	// 		.createReadStream(zipPath)
	// 		.pipe(unzipper.Extract({ path: tmpDir }))
	// 		.promise();

	// 	const files = await fs.promises.readdir(tmpDir);

	// 	/* =========================
	//    2. COVER IMAGE
	// ========================= */
	// 	await this.copyAndNormalizeReleaseImage({
	// 		files,
	// 		tmpDir,
	// 		releaseDir,
	// 		upc,
	// 	});

	// 	/* =========================
	//    3. AUDIO FILES
	// ========================= */
	// 	const audioFiles = files.filter((f) => /\.(wav|flac|aiff)$/i.test(f));

	// 	for (const t of release.trackCis.sort(
	// 		(a, b) => a.trackNo - b.trackNo,
	// 	)) {
	// 		if (!t.trackFileName) {
	// 			console.warn(`Track ${t.trackNo} không có trackFileName`);
	// 			continue;
	// 		}

	// 		const audio = audioFiles.find((f) => f === t.trackFileName);
	// 		if (!audio) {
	// 			console.warn(
	// 				`Không tìm thấy audio cho track ${t.trackNo}: ${t.trackFileName}`,
	// 			);
	// 			continue;
	// 		}

	// 		const trk = String(t.trackNo).padStart(2, '0');

	// 		await fs.promises.copyFile(
	// 			path.join(tmpDir, audio),
	// 			path.join(releaseDir, `${upc}_01_${trk}${path.extname(audio)}`),
	// 		);
	// 	}

	// 	/* =========================
	//    4. CI EXCEL
	// ========================= */
	// 	const rows = this.parseCiRawRowsFromRelease(release);

	// 	await this.buildCiExcel({
	// 		templatePath,
	// 		outputPath: path.join(releaseDir, `${upc}.xlsx`),
	// 		rows,
	// 	});

	// 	/* =========================
	//    5. CLEAN TMP
	// ========================= */
	// 	await this.safeRemoveDir(tmpDir);

	// 	console.log('[DONE]', {
	// 		ciOrderId,
	// 		upc,
	// 		output: releaseDir,
	// 	});
	// }

	async safeRemoveDir(dir: string) {
		for (let i = 0; i < 10; i++) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
				return;
			} catch (e: any) {
				if (e.code !== 'EPERM') throw e;
				await new Promise((r) => setTimeout(r, 500));
			}
		}
	}

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

	async copyAndNormalizeReleaseImage({
		files,
		tmpDir,
		releaseDir,
		upc,
	}: {
		files: string[];
		tmpDir: string;
		releaseDir: string;
		upc: string;
	}) {
		const image = files.find((f) => /\.(jpg|jpeg|png|tif)$/i.test(f));
		if (!image) return;

		const inputPath = path.join(tmpDir, image);
		const outputPath = path.join(
			releaseDir,
			`${upc}${path.extname(image)}`,
		);

		const img = sharp(inputPath);
		const meta = await img.metadata();

		const oldWidth = meta.width ?? 0;
		const oldHeight = meta.height ?? 0;

		// Không resize
		if (oldWidth >= 3000 && oldHeight >= 3000) {
			fs.copyFileSync(inputPath, outputPath);

			console.log(
				`[RELEASE_IMAGE_COPY] upc=${upc} original=${oldWidth}x${oldHeight} resized=false`,
			);

			img.destroy();
			return;
		}

		// Resize
		console.log(
			`[RELEASE_IMAGE_RESIZE] upc=${upc} original=${oldWidth}x${oldHeight} target=3000x3000`,
		);

		await img.resize(3000, 3000, { fit: 'cover' }).toFile(outputPath);

		img.destroy();
	}

	parseCiRawRowsFromRelease(release: Release_29_12): CiRawRow[] {
		const formatCiDate = (value: Date | string) => {
			const d = value instanceof Date ? value : new Date(value);
			return [
				d.getFullYear(),
				String(d.getMonth() + 1).padStart(2, '0'),
				String(d.getDate()).padStart(2, '0'),
			].join('/');
		};

		return (release.trackCis || []).map((t) => {
			const hasVocalsOrLanguage = t.language
				? LANGUAGE_MAPPING[t.language]
				: 'No linguistic content - zxx';

			return {
				checkNo: 1,
				groupingId: null,

				releaseTitle: release.releaseTitle,
				versionDescription: release.versionDescription ?? null,
				artist: release.artist,
				displayArtist: null,
				gtin: release.gtin ?? '',
				// catalogueNo:
				// 	release.catalogueNo ?? `auto_catalog_ag_${release.gtin}`,
				catalogueNo:
					release.catalogueNo && release.catalogueNo.trim() !== ''
						? release.catalogueNo
						: `${release.label}_${release.gtin}`,
				releaseFormatType: release.releaseFormatType,
				soundCarrier: null,
				priceBand: release.priceBand ?? null,

				licensedTerritoriesInclude: release.licensedTerritoriesInclude,
				licensedTerritoriesExclude: null,
				releaseStartDate: formatCiDate(release.releaseStartDate),
				releaseEndDate: null,
				grid: null,

				pYear: release.pYear,
				pHolder: release.pHolder,
				cYear: release.cYear,
				cHolder: release.cHolder,

				status: null,
				label: release.label,

				mainGenre:
					GENRE_MAPPING[release.mainGenre] ??
					release.mainGenre ??
					null,
				mainSubGenre: null,

				alternateGenre: release.alternateGenre
					? (GENRE_MAPPING[release.alternateGenre] ??
						release.alternateGenre ??
						null)
					: null,
				alternateSubGenre: null,

				explicitContent: release.isExplicit === true ? 'Y' : 'N',

				volumeNo: 1,
				volumeTotal: 1,
				services: null,

				// track
				trackNo: t.trackNo,
				trackTitle: t.trackTitle,
				trackVersion: t.trackTitleVersion ?? null,

				trackArtist: t.trackArtist,
				trackDisplayArtist: null,
				isrc: t.trackISRC,
				trackGrid: null,
				availableSeparately: 'Y',

				trackPYear: t.pLineYear,
				trackPHolder: t.pLineText,

				trackMainGenre: release.mainGenre
					? (GENRE_MAPPING[release.mainGenre] ?? release.mainGenre)
					: null,
				trackMainSubGenre: null,

				trackAlternateGenre: release.alternateGenre
					? (GENRE_MAPPING[release.alternateGenre] ??
						release.alternateGenre)
					: null,
				trackAlternateSubGenre: null,

				trackExplicitContent: t.isExplicit === true ? 'Y' : 'N',

				producers: release.artist,
				mixers: release.artist,
				composers:
					t.composers && t.composers.trim() !== ''
						? t.composers
						: release.artist,

				lyricists:
					hasVocalsOrLanguage === 'No linguistic content - zxx'
						? null
						: release.artist,

				publishers: null,

				hasInstruments: 'Y',
				hasVocalsOrLanguage,
				previewStartTime: 30,
				originalReleaseDate: null,
			};
		});
	}

	getSelectOptionsFromMetadataTemplate(column: string): string[] {
		if (!column) return [];

		const col = column.trim().toUpperCase();

		const filePath = path.resolve(
			'src/modules/access-bomb/file/file-ci.xlsx',
		);

		// Đọc file Excel
		const workbook = XLSX.readFile(filePath);

		console.log('Available sheets:', workbook.SheetNames);

		// Thử đọc sheet GENRES
		if (workbook.SheetNames.includes('GENRES')) {
			const worksheet = workbook.Sheets['GENRES'];
			const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

			console.log('GENRES data:', data);

			// Tìm column index (A=0, B=1, ..., W=22, X=23)
			const colIndex = col.charCodeAt(0) - 65;

			const values: string[] = [];
			for (const row of data as any[]) {
				if (row[colIndex]) {
					values.push(String(row[colIndex]).trim());
				}
			}

			return values;
		}

		// Hoặc export toàn bộ file ra JSON để xem
		console.log('\n=== ALL SHEETS DATA ===');
		workbook.SheetNames.forEach((sheetName) => {
			const worksheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
			console.log(`\nSheet: ${sheetName}`);
			console.log(JSON.stringify(data.slice(0, 20), null, 2)); // 20 rows đầu
		});

		return [];
	}

	getSelectOptionsFromMetadataTemplate2(columnName: string): string[] {
		if (!columnName) return [];

		const filePath = path.resolve(
			'src/modules/access-bomb/file/file-ci.xlsx',
		);

		const workbook = XLSX.readFile(filePath);
		const sheet = workbook.Sheets['METADATA TEMPLATE'];
		if (!sheet) return [];

		const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
		if (!rows.length) return [];

		const headerRow = rows[0].map((v) =>
			typeof v === 'string' ? v.trim() : v,
		);

		const startIndex = headerRow.findIndex((v) => v === columnName);

		if (startIndex === -1) return [];

		const result: string[] = [];

		for (let i = startIndex + 1; i < headerRow.length; i++) {
			const cell = headerRow[i];

			// gặp group mới (IN HOA) thì dừng
			if (
				typeof cell === 'string' &&
				cell === cell.toUpperCase() &&
				cell.length > 2
			) {
				break;
			}

			if (cell) {
				result.push(String(cell).trim());
			}
		}

		return result;
	}

	// async parseRelease_29_12(id: number): Promise<Release_29_12> {
	// 	// 1. Fetch from release_bomb_all
	// 	const releaseBomb = await this.releaseBombAllRepo.findOne({
	// 		where: { id },
	// 	});

	// 	if (!releaseBomb) {
	// 		throw new Error(`Release not found: ${id}`);
	// 	}

	// 	// 2. Parse JSONB response
	// 	const data = releaseBomb.response as ReleaseDetailAll;

	// 	// 3. Transform to Release_29_12
	// 	const release = new Release_29_12();

	// 	// Basic fields
	// 	release.id = data.releaseId;
	// 	release.releaseTitle = data.name;
	// 	release.versionDescription = data.version;
	// 	release.artist = data.artistName;
	// 	release.gtin = String(data.upc);
	// 	release.catalogueNo = data.catalog;
	// 	release.releaseFormatType = this.mapReleaseType(data.releaseTypeId);
	// 	release.priceBand = 'Mid';
	// 	release.licensedTerritoriesInclude = 'WW';
	// 	release.releaseStartDate = new Date(data.releaseDate);

	// 	// Parse copyright P
	// 	const pMatch = data.copyrightP?.match(/^(\d{4})\s+(.+)$/);
	// 	release.pYear = pMatch ? Number(pMatch[1]) : null;
	// 	release.pHolder = pMatch ? pMatch[2] : data.copyrightP;

	// 	// Parse copyright C
	// 	const cMatch = data.copyrightC?.match(/^(\d{4})\s+(.+)$/);
	// 	release.cYear = cMatch ? Number(cMatch[1]) : null;
	// 	release.cHolder = cMatch ? cMatch[2] : data.copyrightC;

	// 	// Metadata
	// 	release.label = data.labelName;
	// 	release.mainGenre = this.mapGenreId(data.primaryMusicStyleId) ?? '';
	// 	release.alternateGenre = this.mapGenreId(data.secondaryMusicStyleId);
	// 	release.primaryMusicStyleId = data.primaryMusicStyleId;
	// 	release.secondaryMusicStyleId = data.secondaryMusicStyleId;
	// 	release.isExplicit = data.parentalAdvisory ?? false;

	// 	// Transform tracks
	// 	release.trackCis = (data.tracks || []).map((track, index) => {
	// 		const t = new Track_29_12();

	// 		t.id = track.trackId;
	// 		t.trackNo = index + 1; // Position in array
	// 		t.releaseId = String(data.releaseId);
	// 		t.discNumber = track.discNumber ?? 1;
	// 		t.trackNumber = index + 1;
	// 		t.trackTitle = track.name;
	// 		t.trackTitleVersion = track.version ?? '';
	// 		t.trackArtist = track.artistName;
	// 		t.trackISRC = track.isrc;
	// 		t.trackFileName =
	// 			track.wav?.filename || track.flac?.filename || null;
	// 		t.duration = track.trackLength;
	// 		t.isExplicit = track.explicit;
	// 		t.trackPriceCode = null;

	// 		// Parse P-line
	// 		const pMatch = track.copyrightP?.match(/^(\d{4})\s+(.+)$/);
	// 		t.pLineYear = pMatch ? Number(pMatch[1]) : null;
	// 		t.pLineText = pMatch ? pMatch[2] : track.copyrightP;

	// 		return t;
	// 	});

	// 	return release;
	// }

	// /**
	//  * Map releaseTypeId to format string
	//  */
	// private mapReleaseType(typeId: number): string {
	// 	const typeMap: Record<number, string> = {
	// 		1: 'Album',
	// 		2: 'Single',
	// 		3: 'EP',
	// 	};
	// 	return typeMap[typeId] || 'Single';
	// }

	// /**
	//  * Map music style ID to genre name
	//  * TODO: Implement full genre mapping table
	//  */
	// private mapGenreId(styleId: number | null): string | null {
	// 	if (!styleId) return null;

	// 	const genreMap: Record<number, string> = {
	// 		15: 'World',
	// 		25: 'Alternative',
	// 		// TODO: Add more mappings
	// 	};

	// 	return genreMap[styleId] || null;
	// }
}
