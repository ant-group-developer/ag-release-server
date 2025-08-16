import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { TenantUser } from './entities/tenant-user.entity';
import { User } from './entities/user.entity';
import { TenantUserService } from './services/tenant-user.service';
import { UserService } from './services/user.service';
import { UserController } from './user.controller';

@Module({
	imports: [TypeOrmModule.forFeature([User, TenantUser]), AppConfigModule],
	controllers: [UserController],
	providers: [UserService, TenantUserService],
	exports: [UserService, TenantUserService],
})
export class UserModule {}
