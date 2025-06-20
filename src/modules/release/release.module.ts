import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from './entities/release.entity';

@Module({ imports: [TypeOrmModule.forFeature([Release])] })
export class ReleaseModule {}
