import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRoleController } from './artist-role.controller';
import { ArtistRole } from './entities/artist-role.entity';
import { ArtistRoleQbService } from './services/artist-role.qb.service';
import { ArtistRoleService } from './services/artist-role.service';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistRole])],
	controllers: [ArtistRoleController],
	providers: [ArtistRoleService, ArtistRoleQbService],
})
export class ArtistRoleModule {}
