// service
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import * as unzipper from 'unzipper';
import XlsxPopulate from 'xlsx-populate';
import { Release } from '../entities/metadata.entity';
import { ReleaseCi } from '../entities/release-ci.entity';
import { CI_COLUMN_MAP, CiRawRow } from '../interface/interface';

@Injectable()
export class ParseDataCiService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(ReleaseCi)
		private readonly releaseCiRepo: Repository<ReleaseCi>,
	) {}

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
		const releaseCi = await this.releaseCiRepo.findOne({
			where: { id },
			relations: ['trackCis'],
		});

		if (!releaseCi) {
			throw new NotFoundException('Release not found');
		}

		return releaseCi;
	}

	async parseRelease(id: number) {
		console.log('[RELEASE]', id);

		const release = await this.findOne(id);
		const upc = release.gtin;

		const downloadDir = path.resolve('downloads');
		const unzipDir = path.resolve('download_unzip');
		const outputRoot = path.resolve('import');
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

		await fs
			.createReadStream(zipPath)
			.pipe(unzipper.Extract({ path: tmpDir }))
			.promise();

		const files = fs.readdirSync(tmpDir);

		const image = files.find((f) => /\.(jpg|jpeg|png|tif)$/i.test(f));
		if (image) {
			fs.copyFileSync(
				path.join(tmpDir, image),
				path.join(releaseDir, `${upc}${path.extname(image)}`),
			);
		}

		const audioFiles = files
			.filter((f) => /\.(wav|flac|aiff)$/i.test(f))
			.sort();

		release.trackCis
			.sort((a, b) => a.trackNo - b.trackNo)
			.forEach((t, i) => {
				const audio = audioFiles[i];
				if (!audio) return;
				const trk = String(t.trackNo).padStart(2, '0');
				fs.copyFileSync(
					path.join(tmpDir, audio),
					path.join(
						releaseDir,
						`${upc}_01_${trk}${path.extname(audio)}`,
					),
				);
			});

		const rows = this.parseCiRawRowsFromRelease(release);

		await this.buildCiExcel({
			templatePath,
			outputPath: path.join(releaseDir, `${upc}.xlsx`),
			rows,
		});

		fs.rmSync(tmpDir, { recursive: true, force: true });

		console.log('[DONE]', upc);
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

	parseCiRawRowsFromRelease(release: ReleaseCi): CiRawRow[] {
		return (release.trackCis || []).map((t) => ({
			checkNo: 1,
			groupingId: null,

			releaseTitle: release.releaseTitle,
			versionDescription: release.versionDescription ?? null,
			artist: release.artist,
			// displayArtist: release.artist,
			displayArtist: null,
			gtin: release.gtin,
			catalogueNo: release.catalogueNo ?? null,
			releaseFormatType: release.releaseFormatType,
			soundCarrier: null,
			priceBand: release.priceBand ?? null,

			licensedTerritoriesInclude: release.licensedTerritoriesInclude,
			// licensedTerritoriesExclude:
			// 	release.licensedTerritoriesExclude ?? null,
			licensedTerritoriesExclude: null,
			releaseStartDate: release.releaseStartDate,
			// releaseEndDate: release.releaseEndDate ?? null,
			releaseEndDate: null,
			grid: null,

			pYear: release.pYear,
			pHolder: release.pHolder,
			cYear: release.cYear,
			cHolder: release.cHolder,

			status: null,
			label: release.label,

			mainGenre: release.mainGenre,
			// mainSubGenre: release.mainSubGenre ?? null,
			mainSubGenre: null,
			alternateGenre: release.alternateGenre ?? null,
			// alternateSubGenre: release.alternateSubGenre ?? null,
			alternateSubGenre: null,
			// explicitContent: release.explicitContent,
			explicitContent: 'N',

			// volumeNo: release.volumeNo,
			// volumeTotal: release.volumeTotal,
			volumeNo: 1,
			volumeTotal: 1,

			// track
			trackNo: t.trackNo,
			trackTitle: t.trackTitle,
			trackVersion: t.mixVersion ?? null,
			trackArtist: t.artists,
			trackDisplayArtist: t.displayArtist ?? null,
			isrc: t.isrc ?? '',
			trackGrid: null,
			availableSeparately: t.availableSeparately,

			trackPYear: t.pYear ?? null,
			trackPHolder: t.pHolder ?? null,

			trackMainGenre: t.mainGenre ?? null,
			trackMainSubGenre: t.mainSubGenre ?? null,
			trackAlternateGenre: t.alternateGenre ?? null,
			trackAlternateSubGenre: t.alternateSubGenre ?? null,
			trackExplicitContent: t.explicitContent ?? null,

			producers: t.producers ?? null,
			mixers: t.mixers ?? null,
			composers: t.composers ?? null,
			lyricists: t.lyricists ?? null,
			publishers: t.publishers ?? null,

			hasInstruments: t.hasInstruments ?? null,
			hasVocalsOrLanguage: t.hasVocalsLanguage ?? null,
			previewStartTime: t.previewStartTime ?? null,
			originalReleaseDate: t.originalReleaseDate ?? null,
		}));
	}
}
