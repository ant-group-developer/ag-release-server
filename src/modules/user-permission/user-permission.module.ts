import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPermission } from './entities/user-permission.entity';

@Module({
	imports: [TypeOrmModule.forFeature([UserPermission])],
})
export class UserPermissionModule {}
