import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { stringToCode } from 'src/utils/util';
import { ILike, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Dsp } from '../../dsp/entities/dsp.entity';
import { Release } from '../../release/entities/release.entity';
import { Track } from '../../track/entities/track.entity';
import { TrackRevenue } from '../entities/track-revenue.entity';

interface TrackRow {
	transactionDate: string;
	source: string;
	territory: string;
	currency: string;
	netAmount: number;
	configuration: string;
	trackTitle: string;
	releaseTitle: string;
	dspName: string;
	type: string;

	isrc: string;
	trackArtist: string | null;
	releaseLabel: string | null;
}

@Injectable()
export class TrackRevenueDataService {
	private readonly logger = new Logger(TrackRevenueDataService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		@InjectRepository(TrackRevenue)
		private readonly trackRevenueRepo: Repository<TrackRevenue>,
	) {}

	async importFromFile(filePath: string) {
		const dataRaw = this.getDataRaw(filePath);
		this.logger.debug(`Loaded ${dataRaw.length} rows from Excel`);
		await this.bulkCreateTrackRevenue(dataRaw);
	}

	private getDataRaw(filePath: string): TrackRow[] {
		const workbook = XLSX.readFile(filePath);
		const sheetName = workbook.SheetNames[0];
		const sheet = workbook.Sheets[sheetName];

		const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

		const mapped: TrackRow[] = rows.map((row) => ({
			transactionDate: row['Transaction Date'],
			source: row['Source'],
			territory: row['Territory'],
			currency: row['Currency'],
			netAmount: parseFloat(row['Net Amount']),
			configuration: row['Configuration'],
			trackTitle: row['Track Title'],
			releaseTitle: row['Release Title'],
			dspName: row['Source'],
			type: row['Type'],

			isrc: row['ISRC'],
			trackArtist: row['Track Artist'],
			releaseLabel: row['Release Label'],
		}));

		return mapped.filter((r) => r.type === 'Track');
	}

	private async bulkCreateTrackRevenue(data: TrackRow[]) {
		for (let i = 0; i < data.length; i++) {
			const item = data[i];

			this.logger.debug(
				`Processing record ${i + 1}/${data.length}: ${item.trackTitle}`,
			);

			const dsp = await this.createDspIfNotExists(item.dspName);

			const track = await this.createTrackIfNotExists(
				item.isrc,
				item.trackTitle,
				item.releaseTitle,
			);

			this.logger.log(
				`Processed track "${item.trackTitle}" (id=${track.id}) for release "${item.releaseTitle}"`,
			);

			const entity = this.trackRevenueRepo.create({
				reportDate: item.transactionDate,
				dspId: dsp.id,
				countryCode: item.territory,
				currencyCode: item.currency,
				amount: item.netAmount,
				configuration: item.configuration,
				trackId: track.id,
			});

			await this.trackRevenueRepo.save(entity);

			this.logger.log(
				`Saved track revenue record for trackId=${track.id}`,
			);
		}

		this.logger.log(
			`Finished inserting ${data.length} track revenue records`,
		);
	}

	private async createReleaseIfNotExists(title: string) {
		const release = await this.releaseRepo.findOne({
			where: { title: ILike(title) },
		});

		if (!release) {
			const newRelease = this.releaseRepo.create({
				title,
				albumFormatId: '08CXMra61O',
			});
			const savedRelease = await this.releaseRepo.save(newRelease);
			this.logger.log(
				`Created new release: "${title}" (id=${savedRelease.id})`,
			);
			return savedRelease;
		}

		this.logger.log(
			`Found existing release: "${title}" (id=${release.id})`,
		);
		return release;
	}

	private async createDspIfNotExists(name: string) {
		const dsp = await this.dspRepo.findOne({
			where: { name: ILike(name) },
		});

		if (!dsp) {
			const newEntity = this.dspRepo.create({
				name,
				code: stringToCode(name),
			});
			const savedEntity = await this.dspRepo.save(newEntity);
			this.logger.log(`Created new dsp: "${dsp}" (id=${savedEntity.id})`);
			return savedEntity;
		}

		this.logger.log(`Found existing release: "${name}" (id=${dsp.id})`);
		return dsp;
	}

	private async createTrackIfNotExists(
		isrc: string,
		titleTrack: string,
		titleRelease: string,
	) {
		const track = await this.trackRepo.findOne({
			where: { isrc },
		});

		if (!track) {
			const release = await this.createReleaseIfNotExists(titleRelease);

			const newTrack = this.trackRepo.create({
				title: titleTrack,
				releaseId: release.id,
				isrc,
			});

			const savedTrack = await this.trackRepo.save(newTrack);
			this.logger.log(
				`Created new track: "${titleTrack}" (id=${savedTrack.id})`,
			);
			return savedTrack;
		}

		this.logger.log(
			`Found existing track: "${titleTrack}" (id=${track.id})`,
		);
		return track;
	}
}
