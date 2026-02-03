import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormatController } from './album-format.controller';
import { AlbumFormat } from './entities/album-format.entity';
import { AlbumFormatQueryService } from './services/album-format.query.service';
import { AlbumFormatService } from './services/album-format.service';

@Module({
	imports: [TypeOrmModule.forFeature([AlbumFormat])],
	controllers: [AlbumFormatController],
	providers: [AlbumFormatService, AlbumFormatQueryService],
})
export class AlbumFormatModule {}
