import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseCoverArt } from './entities/release-cover-art.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseCoverArt])],
})
export class ReleaseCoverArtModule {}
