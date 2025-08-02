/* eslint-disable */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { mainArtistRole } from 'src/modules/artist-role/constants/artist-role.constant';
import { UserType } from 'src/modules/user/enum/user.enum';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
	listCountries,
	listLanguages,
	listTimeZones,
} from '../constants/database.init.constant';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
	private readonly logger = new Logger(DatabaseInitService.name);

	private defaultUser: {
		id: string;
		name: string;
		email: string;
		type: UserType;
		creatorId: string;
		modifierId: string;
	};

	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly configService: ConfigService,
	) {
		this.defaultUser = {
			id: this.configService.get<string>('DEFAULT_USER_ID')!,
			name: this.configService.get<string>('DEFAULT_NAME')!,
			email: this.configService.get<string>('DEFAULT_EMAIL')!,
			type: this.configService.get<UserType>('USER_TYPE')!,
			creatorId: this.configService.get<string>('DEFAULT_USER_ID')!,
			modifierId: this.configService.get<string>('DEFAULT_USER_ID')!,
		};
	}

	async onModuleInit() {
		try {
			await Promise.all([
				this.initUser(),
				this.initCountry(),
				this.initLanguage(),
				this.initTimeZones(),
				this.initMainArtistRole(),
			]);
		} catch (error) {
			this.logger.error('Error initializing database:', error);
		}
	}

	private async initUser() {
		const countQuery = `SELECT COUNT(*) FROM users`;
		const result = await this.dataSource.query(countQuery);

		if (result[0].count === '0') {
			const query = `
				INSERT INTO users (id, name, email, type, creator_id, modifier_id)
				VALUES ($1, $2, $3, $4, $5, $6)
			`;

			await this.dataSource.query(query, [
				this.defaultUser.id,
				this.defaultUser.name,
				this.defaultUser.email,
				this.defaultUser.type,
				this.defaultUser.creatorId,
				this.defaultUser.modifierId,
			]);

			this.logger.log('Default user inserted successfully');
		} else {
			this.logger.log(
				'Users table already has data, skipping initialization',
			);
		}
	}

	private async initCountry() {
		const countQuery = `SELECT COUNT(*) FROM countries`;
		const result = await this.dataSource.query(countQuery);

		const dataInit = listCountries;

		if (result[0].count === '0') {
			this.logger.log('Initializing country');
			const query = `
				INSERT INTO countries (
					id, name, iso3, iso2, numeric_code, phone_code, capital,
					currency, currency_name, currency_symbol, region_id, nationality, continent
				) VALUES (
					$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
				)
			`;

			Promise.all(
				dataInit.map((item) => {
					return this.dataSource.query(query, [
						uuidv4(),
						item[0],
						item[1],
						item[2],
						item[3],
						item[4],
						item[5],
						item[6],
						item[7],
						item[8],
						item[9],
						item[10],
						item[11],
					]);
				}),
			);

			this.logger.log('Countries inserted successfully');
		} else {
			this.logger.log(
				'Countries table already has data, skipping initialization',
			);
		}
	}

	private async initLanguage() {
		const countQuery = `SELECT COUNT(*) FROM languages`;
		const result = await this.dataSource.query(countQuery);

		if (result[0].count === '0') {
			this.logger.log('Initializing language');
			const query = `
				INSERT INTO languages (
					id, name, code
				) VALUES (
					$1, $2, $3
				)
			`;

			const dataInitLanguage = listLanguages;

			for (const language of dataInitLanguage) {
				await this.dataSource.query(query, [
					uuidv4(),
					language[0],
					language[1],
				]);
			}

			this.logger.log('Languages inserted successfully');
		} else {
			this.logger.log(
				'Languages table already has data, skipping initialization',
			);
		}
	}

	private async initTimeZones() {
		const countQuery = `SELECT COUNT(*) FROM timezones`;
		const result = await this.dataSource.query(countQuery);

		if (result[0].count === '0') {
			this.logger.log('Initializing timezones');
			const query = `
				INSERT INTO timezones (
					id, name, utc, zone
				) VALUES (
					$1, $2, $3, $4
				)
			`;

			const dataInitTimeZones = listTimeZones;

			for (const timezone of dataInitTimeZones) {
				await this.dataSource.query(query, [
					uuidv4(),
					timezone[0],
					timezone[1],
					timezone[2],
				]);
			}

			this.logger.log('Timezones inserted successfully');
		} else {
			this.logger.log(
				'Timezones table already has data, skipping initialization',
			);
		}
	}

	private async initMainArtistRole() {
		const countQuery = `
			SELECT COUNT(*) FROM artist_roles
			WHERE name = $1
  		`;
		const result = await this.dataSource.query(countQuery, [
			mainArtistRole.name,
		]);

		if (result[0].count === '0') {
			this.logger.log('Initializing main artist role');
			const query = `
      			INSERT INTO artist_roles (
        			id, name, value, creator_id, modifier_id
      			) VALUES (
        			$1, $2, $3, $4, $5
      			)
    		`;

			await this.dataSource.query(query, [
				uuidv4(),
				mainArtistRole.name,
				mainArtistRole.value,
				this.defaultUser.id,
				this.defaultUser.id,
			]);

			this.logger.log('Main artist role inserted successfully');
		} else {
			this.logger.log(
				'Artist role table already has data, skipping initialization',
			);
		}
	}
}
