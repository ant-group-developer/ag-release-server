import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseLocalize } from './entities/release-localize.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseLocalize])],
})
export class ReleaseLocalizeModule {}
