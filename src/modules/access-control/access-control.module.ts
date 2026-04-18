import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../cache/cache.module';
import { PermissionModule } from '../permission/permission.module';
import { RoleModule } from '../role/role.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantRolesModule } from '../tenant-roles/tenant-roles.module';
import { UserModule } from '../user/user.module';
import { UserRole } from '../user-role/user-role.entity';
import { AccessControlService } from './access-control.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([UserRole]),
		forwardRef(() => UserModule),
		forwardRef(() => TenantModule),
		TenantRolesModule,
		PermissionModule,
		RoleModule,
		CacheModule,
	],
	providers: [AccessControlService],
	exports: [AccessControlService],
})
export class AccessControlModule {}
