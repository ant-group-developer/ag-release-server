import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationUser } from './entities/organization-user.entity';

@Module({
	imports: [TypeOrmModule.forFeature([OrganizationUser])],
})
export class OrganizationUserModule {}
