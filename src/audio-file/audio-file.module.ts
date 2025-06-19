import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioFile } from './entities/audio-file.entity';

@Module({
	imports: [TypeOrmModule.forFeature([AudioFile])],
})
export class AudioFileModule {}
