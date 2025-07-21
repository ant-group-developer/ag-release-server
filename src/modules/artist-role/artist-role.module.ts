import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRoleController } from './artist-role.controller';
import { ArtistRole } from './entities/artist-role.entity';
import { ArtistRoleQueryService } from './services/artist-role.query.service';
import { ArtistRoleService } from './services/artist-role.service';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistRole])],
	controllers: [ArtistRoleController],
	providers: [ArtistRoleService, ArtistRoleQueryService],
})
export class ArtistRoleModule {}
