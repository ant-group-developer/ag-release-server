import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { UserType } from 'src/modules/user/enum/user.enum';
import { DataSource } from 'typeorm';
import { listCountries, listLanguages } from '../constants/database.constant';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly configService: ConfigService,
	) {}

	async onModuleInit() {
		try {
			await this.initUser();
			await this.initCountry();
			await this.initLanguage();
		} catch (error) {
			console.error('Error initializing database:', error);
		}
	}

	private async initUser() {
		const countQuery = `SELECT COUNT(*) FROM users`;
		const result = await this.dataSource.query(countQuery);

		if (result[0].count === '0') {
			const defaultUser = {
				id: this.configService.get<string>('DEFAULT_USER_ID'),
				name: this.configService.get<string>('DEFAULT_NAME'),
				email: this.configService.get<string>('DEFAULT_EMAIL'),
				type: this.configService.get<UserType>('USER_TYPE'),
				creatorId: this.configService.get<string>('DEFAULT_USER_ID'),
				modifierId: this.configService.get<string>('DEFAULT_USER_ID'),
			};

			const query = `
				INSERT INTO users (id, name, email, type, creator_id, modifier_id)
				VALUES ($1, $2, $3, $4, $5, $6)
			`;

			await this.dataSource.query(query, [
				defaultUser.id,
				defaultUser.name,
				defaultUser.email,
				defaultUser.type,
				defaultUser.creatorId,
				defaultUser.modifierId,
			]);

			console.log('Default user inserted successfully');
		} else {
			console.log(
				'Users table already has data, skipping initialization',
			);
		}
	}

	private async initCountry() {
		const countQuery = `SELECT COUNT(*) FROM countries`;
		const result = await this.dataSource.query(countQuery);

		const dataInit = listCountries;

		if (result[0].count === '0') {
			const query = `
			INSERT INTO countries (
			  id, name, iso3, iso2, numeric_code, phone_code, capital, currency, currency_name, currency_symbol, region_id, nationality
			) VALUES (
			  uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
			)
		  `;

			for (const country of dataInit) {
				await this.dataSource.query(query, country);
			}

			console.log('Countries inserted successfully');
		} else {
			console.log(
				'Countries table already has data, skipping initialization',
			);
		}
	}

	private async initLanguage() {
		const countQuery = `SELECT COUNT(*) FROM languages`;
		const result = await this.dataSource.query(countQuery);

		if (result[0].count === '0') {
			const query = `
			INSERT INTO languages (
				id, name, code
			) VALUES (
				uuid_generate_v4(), $1, $2
			)
		`;

			const dataInitLanguage = listLanguages;

			for (const language of dataInitLanguage) {
				await this.dataSource.query(query, language);
			}

			console.log('Languages inserted successfully');
		} else {
			console.log(
				'Languages table already has data, skipping initialization',
			);
		}
	}
}
