// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
// import { DBType } from './enum/database.type.enum';
// @Injectable()
// export class DatabaseOptions implements TypeOrmOptionsFactory {
//   constructor(private configService: ConfigService) {}

import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { DBType } from './enum/database.type.enum';

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

export const getTypeOrmConfig = (
	configService: ConfigService,
): TypeOrmModuleOptions => ({
	type: configService.get<DBType>('DB_TYPE')!,
	host: configService.get<string>('DB_HOST'),
	port: configService.get<number>('DB_PORT'),
	username: configService.get<string>('DB_USER'),
	password: configService.get<string>('DB_PASS'),
	database: configService.get<string>('DB_NAME'),
	entities: [__dirname + '/../**/*.entity{.ts,.js}'],
	synchronize: true,
	autoLoadEntities: true,
	namingStrategy: new SnakeNamingStrategy(),
	// timezone: DBConst.UTC_OFFSET,
	logging: true,
});
