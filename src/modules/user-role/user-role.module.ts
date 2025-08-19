import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionModule } from '../permission/permission.module';
import { RoleModule } from '../role/role.module';
import { UserModule } from '../user/user.module';
import { UserRoleController } from './user-role.controller';
import { UserRole } from './user-role.entity';
import { UserRoleService } from './user-role.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([UserRole]),
		UserModule,
		RoleModule,
		PermissionModule,
	],
	providers: [UserRoleService],
	exports: [UserRoleService],
	controllers: [UserRoleController],
})
export class UserRoleModule {}
