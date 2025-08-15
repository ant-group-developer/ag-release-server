import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../permission/entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { RoleController } from './role.controller';
import { RoleQueryService } from './services/role.query.service';
import { RoleService } from './services/role.service';

@Module({
	imports: [TypeOrmModule.forFeature([Role, RolePermission, Permission])],
	controllers: [RoleController],
	providers: [RoleService, RoleQueryService],
})
export class RoleModule {}
