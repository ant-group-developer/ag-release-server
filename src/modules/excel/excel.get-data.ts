import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Action } from '../action/entities/action.entity';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { Genre } from '../genre/entities/genre.entity';
import { Language } from '../language/entities/language.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { TrackSensitive } from '../track-sensitive/entities/track-sensitive.entity';
import { AppConfig } from '../app-config/entities/app-config.entity';

@Injectable()
export class ExcelGetDataService {
	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,
		@InjectRepository(PriceTier)
		private readonly priceTierRepo: Repository<PriceTier>,
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,
		@InjectRepository(TrackSensitive)
		private readonly trackSensitiveRepo: Repository<TrackSensitive>,
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,
		@InjectRepository(Action)
		private readonly actionRepo: Repository<Action>,

		@InjectRepository(AppConfig)
		private readonly appRepo: Repository<AppConfig>,
	) { }
	async getAlbumFormats(): Promise<string[]> {
		const data = await this.albumFormatRepo.find({
			select: ['name'],
			order: { name: 'ASC' },
		});

		return data.map((item) => item.name);
	}

	async getLogo() {
		const appConfig = await this.appRepo.find();

		const configData = appConfig[0].config;
		return configData?.website?.logo ?? null;
	}

	async getPriceTiers(): Promise<string[]> {
		const data = await this.priceTierRepo.find({
			select: {
				code: true,
				amount: true,
				currency: {
					code: true,
				},
			},
			relations: {
				currency: true,
			},
			where: { isActive: true },
			order: { code: 'ASC' },
		});

		return data.map(
			(item) =>
				`${item.code} - ${item.amount} ${item.currency?.code ?? ''}`,
		);
	}

	async getGenres(): Promise<string[]> {
		const data = await this.genreRepo.find({
			select: ['name'],
			order: { name: 'ASC' },
		});

		return data.map((item) => item.name);
	}

	async getTrackSensitives(): Promise<string[]> {
		const data = await this.trackSensitiveRepo.find({
			select: ['name'],
			order: { name: 'ASC' },
		});

		return data.map((item) => item.name);
	}

	async getLanguages(): Promise<string[]> {
		const data = await this.languageRepo.find({
			select: ['name', 'code'],
			order: { name: 'ASC' },
		});

		const languages = data.map((item) => `${item.name} - ${item.code}`);

		return ['No vocal humans', ...languages];
	}

	async getTrackPolicies(): Promise<string[]> {
		const data = await this.actionRepo.find({
			select: ['name'],
			order: { name: 'ASC' },
		});
		return data.map((item) => item.name);
	}
}
