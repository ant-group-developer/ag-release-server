import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { UserType } from 'src/modules/user/enum/user.enum';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly configService: ConfigService,
	) {}

	async onModuleInit() {
		try {
			const countQuery = `SELECT COUNT(*) FROM users`;
			const result = await this.dataSource.query(countQuery);

			if (result[0].count === '0') {
				const defaultUser = {
					id: this.configService.get<string>('DEFAULT_USER_ID'),
					name: this.configService.get<string>('DEFAULT_NAME'),
					email: this.configService.get<string>('DEFAULT_EMAIL'),
					type: this.configService.get<UserType>('USER_TYPE'),
					creatorId:
						this.configService.get<string>('DEFAULT_USER_ID'),
					modifierId:
						this.configService.get<string>('DEFAULT_USER_ID'),
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
		} catch (error) {
			console.error('Error initializing database:', error);
		}
	}
}
