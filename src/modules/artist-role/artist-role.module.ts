import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from './entities/artist-role.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistRole])],
})
export class ArtistRoleModule {}
