import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';
import { TrackRevenue } from './entities/track-revenue.entity';

interface TrackRow {
	transactionDate: string;
	source: string;
	territory: string;
	currency: string;
	netAmount: number;
	configuration: string;
	trackTitle: string;
	releaseTitle: string;
	type: string;
}

@Injectable()
export class TrackRevenueService {
	private readonly logger = new Logger(TrackRevenueService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

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
			type: row['Type'],
		}));

		return mapped.filter((r) => r.type === 'Track');
	}

	private async bulkCreateTrackRevenue(data: TrackRow[]) {
		const batchSize = 50;

		const batches: TrackRow[][] = [];
		for (let i = 0; i < data.length; i += batchSize) {
			batches.push(data.slice(i, i + batchSize));
		}

		await Promise.all(
			batches.map(async (batch, batchIndex) => {
				this.logger.debug(
					`Processing batch ${batchIndex + 1}/${batches.length}, rows ${
						batchIndex * batchSize + 1
					}–${batchIndex * batchSize + batch.length}/${data.length}`,
				);

				const entities = await Promise.all(
					batch.map(async (item) => {
						const track = await this.createTrackIfNotExists(
							item.trackTitle,
							item.releaseTitle,
						);

						this.logger.log(
							`Processed track "${item.trackTitle}" (id=${track.id}) for release "${item.releaseTitle}"`,
						);

						return this.trackRevenueRepo.create({
							reportDate: item.transactionDate,
							dspName: item.source,
							countryCode: item.territory,
							currencyCode: item.currency,
							amount: item.netAmount,
							configuration: item.configuration,
							trackId: track.id,
						});
					}),
				);

				await this.trackRevenueRepo.save(entities);
				this.logger.log(
					`Saved ${entities.length} track revenue records`,
				);
			}),
		);

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

	private async createTrackIfNotExists(
		titleTrack: string,
		titleRelease: string,
	) {
		const track = await this.trackRepo.findOne({
			where: { title: ILike(titleTrack) },
		});

		if (!track) {
			const release = await this.createReleaseIfNotExists(titleRelease);

			const newTrack = this.trackRepo.create({
				title: titleTrack,
				releaseId: release.id,
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
