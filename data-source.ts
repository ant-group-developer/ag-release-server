// data-source.ts
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config(); // Load .env file

export default new DataSource({
	type: 'postgres', // hoặc 'postgres', 'mariadb'
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT!) || 3306,
	username: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_DATABASE,

	entities: ['src/**/*.entity{.ts,.js}'],
	migrations: ['src/migrations/*{.ts,.js}'],

	synchronize: false,
	logging: true,
});
