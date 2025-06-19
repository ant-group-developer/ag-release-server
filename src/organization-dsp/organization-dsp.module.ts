import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationDsp } from './entities/organization-dsp.entity';

@Module({
	imports: [TypeOrmModule.forFeature([OrganizationDsp])],
})
export class OrganizationDspModule {}
