import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { DeepPartial, Repository } from 'typeorm';
import { Release_29_12 } from '../entities/metadata.entity.29-12';

@Injectable()
export class CrawlService_29_12 {
	constructor(
		@InjectRepository(Release_29_12)
		private readonly release_29_12_Repo: Repository<Release_29_12>,

		private readonly http: HttpService,
	) {}

	private headers(token: string) {
		return {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			Origin: 'https://bombshelter.revelator.pro',
			'x-client-source': 'revelator-pro-app',
		};
	}

	async crawlAllReleaseMetadata(token: string) {
		const releases = await this.release_29_12_Repo.find({
			select: ['id'],
		});

		const total = releases.length;

		const concurrency = 10; // số request song song
		const saveBatchSize = 50; // số record save 1 lần

		let processed = 0;
		let updated = 0;
		let fail = 0;

		let toSave: DeepPartial<Release_29_12>[] = [];

		for (let i = 0; i < releases.length; i += concurrency) {
			const batch = releases.slice(i, i + concurrency);

			const results = await Promise.all(
				batch.map(async ({ id }) => {
					try {
						const data = await this.getReleaseDetail(token, id);
						return { id, data };
					} catch {
						fail++;
						return null;
					}
				}),
			);

			for (const item of results) {
				processed++;
				if (!item) continue;

				const r = item.data;

				const isExplicit: boolean =
					r.tracks?.some((t: any) => t.explicit === true) ?? false;

				toSave.push({
					id: item.id,

					// releaseTitle: r.name,
					// versionDescription: r.version ?? undefined,
					// artist: r.artistName,
					// gtin: r.upc ? String(r.upc) : undefined,

					// releaseFormatType: String(r.releaseTypeId),
					// priceBand: 'Mid',

					// releaseStartDate: new Date(r.releaseDate),

					// CI Excel sẽ fill
					// licensedTerritoriesInclude: undefined,
					// pYear: undefined,
					// pHolder: undefined,
					// cYear: undefined,
					// cHolder: undefined,
					// catalogueNo: undefined,

					// label: r.labelName,
					// mainGenre: String(r.primaryMusicStyleId),
					// alternateGenre: undefined,

					// primaryMusicStyleId: r.primaryMusicStyleId ?? null,
					// secondaryMusicStyleId: r.secondaryMusicStyleId ?? null,

					isExplicit,
				});

				if (toSave.length >= saveBatchSize) {
					for (const row of toSave) {
						await this.release_29_12_Repo.update(
							{ id: row.id },
							row,
						);
					}
					updated += toSave.length;
					toSave = [];
				}
			}

			// 👉 LOG tiến trình sau mỗi batch
			console.log(
				`[CRAWL RELEASE] ${processed}/${total} | Updated ${updated} | Fail ${fail}`,
			);
		}

		// flush còn lại
		if (toSave.length) {
			for (const row of toSave) {
				await this.release_29_12_Repo.update({ id: row.id }, row);
			}
			updated += toSave.length;
		}

		// 👉 LOG cuối
		console.log(
			`[CRAWL RELEASE DONE] ${processed}/${total} | Updated ${updated} | Fail ${fail}`,
		);

		return { processed, updated, fail };
	}

	private async getTrackDetail(token: string, trackId: number) {
		const { data } = await firstValueFrom(
			this.http.get(
				`https://api.revelator.com/content/track/${trackId}`,
				{ headers: this.headers(token) },
			),
		);
		return data;
	}

	private async getReleaseDetail(token: string, releaseId: number) {
		const { data } = await firstValueFrom(
			this.http.get(
				`https://api.revelator.com/content/release/${releaseId}`,
				{ headers: this.headers(token) },
			),
		);
		return data;
	}

	private extractYear(text?: string): number | undefined {
		if (!text) return undefined;
		const m = text.match(/\b(19|20)\d{2}\b/);
		return m ? Number(m[0]) : undefined;
	}
}
