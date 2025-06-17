import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigCustomModule } from 'src/config/config.module';
import { DatabaseOptions } from './database.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigCustomModule],
      inject: [ConfigService],
      useClass: DatabaseOptions,
    }),
  ],
})
export class DatabaseModule {}
