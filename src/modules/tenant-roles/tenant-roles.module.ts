import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleModule } from '../role/role.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantRole } from './tenant-role.entity';
import { TenantRolesController } from './tenant-roles.controller';
import { TenantRolesService } from './tenant-roles.service';

@Module({
	imports: [TypeOrmModule.forFeature([TenantRole]), RoleModule, forwardRef(() => TenantModule)],
	controllers: [TenantRolesController],
	providers: [TenantRolesService],
	exports: [TenantRolesService],
})
export class TenantRolesModule {}
