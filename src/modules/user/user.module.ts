import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantUser } from './entities/tenant-user.entity';
import { User } from './entities/user.entity';
import { TenantUserService } from './services/tenant-user.service';
import { UserTypeService } from './services/user-type.service';
import { UserService } from './services/user.service';
import { UserController } from './user.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([User, TenantUser]),
		AppConfigModule,
		forwardRef(() => TenantModule),
	],
	controllers: [UserController],
	providers: [UserService, TenantUserService, UserTypeService],
	exports: [UserService, TenantUserService, UserTypeService],
})
export class UserModule {}
