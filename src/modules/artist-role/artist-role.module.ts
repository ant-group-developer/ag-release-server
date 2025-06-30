import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRoleController } from './artist-role.controller';
import { ArtistRoleService } from './artist-role.service';
import { ArtistRole } from './entities/artist-role.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistRole])],
	controllers: [ArtistRoleController],
	providers: [ArtistRoleService],
})
export class ArtistRoleModule {}
