import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

export const AppDataSource = new DataSource({
	type: 'postgres',
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT) || 5432,
	username: process.env.DB_USERNAME || 'postgres',
	password: process.env.DB_PASSWORD || 'postgres',
	database: process.env.DB_DATABASE || 'demo_db',

	entities: ['src/**/*.entity{.ts,.js}'],
	migrations: ['src/migrations/*{.ts,.js}'],

	namingStrategy: new SnakeNamingStrategy(),

	synchronize: false,
	logging: true,
});
