// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
// import { DBType } from './enum/database.type.enum';
// @Injectable()
// export class DatabaseOptions implements TypeOrmOptionsFactory {
//   constructor(private configService: ConfigService) {}

//   createTypeOrmOptions(): TypeOrmModuleOptions {
//     return {
//       type: this.configService.get<DBType>('DB_TYPE')!,
//       host: this.configService.get<string>('DB_HOST'),
//       port: this.configService.get<number>('DB_PORT'),
//       username: this.configService.get<string>('DB_USER'),
//       password: this.configService.get<string>('DB_PASS'),
//       database: this.configService.get<string>('DB_NAME'),
//       // entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
//       entities: [],
//       synchronize: true,
//       autoLoadEntities: true,
//       // timezone: UTC_OFFSET_DB,
//     };
//   }
// }

// export const getTypeOrmConfig = (
// 	configService: ConfigService,
// ): TypeOrmModuleOptions => ({
// 	type: 'postgres',
// 	host: configService.get<string>('DB_HOST'),
// 	port: configService.get<number>('DB_PORT') || 5432,
// 	username: configService.get<string>('DB_USERNAME'),
// 	password: configService.get<string>('DB_PASSWORD'),
// 	database: configService.get<string>('DB_DATABASE'),
// 	entities: [__dirname + '/../**/*.entity{.ts,.js}'],
// 	synchronize: true,
// 	autoLoadEntities: true,
// 	namingStrategy: new SnakeNamingStrategy(),
// 	// timezone: DBConst.UTC_OFFSET,
// 	logging: true,
// });

// import { Injectable } from '@nestjs/common';
// import { TypeOrmOptionsFactory } from '@nestjs/typeorm';

// @Injectable()
// export class DatabaseConfigService implements TypeOrmOptionsFactory {
// 	constructor(private configService: ConfigService) {}

// 	createTypeOrmOptions(): TypeOrmModuleOptions {
// 		return {
// 			type: 'postgres',
// 			host: this.configService.get<string>('DB_HOST'),
// 			port: this.configService.get<number>('DB_PORT') || 5432,
// 			username: this.configService.get<string>('DB_USERNAME'),
// 			password: this.configService.get<string>('DB_PASSWORD'),
// 			database: this.configService.get<string>('DB_DATABASE'),

// 			// Entities
// 			entities: [__dirname + '/../**/*.entity{.ts,.js}'],
// 			autoLoadEntities: true,

// 			// Naming strategy
// 			namingStrategy: new SnakeNamingStrategy(),

// 			// Tắt synchronize, dùng migration hoặc sql khi cần thay đổi db
// 			// synchronize: true,

// 			logging: true,
// 		};
// 	}
// }
