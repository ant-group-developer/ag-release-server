import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../permission/entities/permission.entity';
import { User } from '../user/entities/user.entity';
import { UserPermission } from './entities/user-permission.entity';
import { UserPermissionService } from './services/user-permission.service';
import { UserPermissionValidateService } from './services/user-permission.validate.service';
import { UserPermissionController } from './user-permission.controller';

@Module({
	imports: [TypeOrmModule.forFeature([UserPermission, User, Permission])],
	controllers: [UserPermissionController],
	providers: [UserPermissionService, UserPermissionValidateService],
})
export class UserPermissionModule {}
