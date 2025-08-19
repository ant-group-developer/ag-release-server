import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { PermissionController } from './permission.controller';
import { PermissionQueryService } from './services/permission.query.service';
import { PermissionService } from './services/permission.service';

@Module({
	imports: [TypeOrmModule.forFeature([Permission])],
	controllers: [PermissionController],
	providers: [PermissionService, PermissionQueryService],
	exports: [PermissionService, PermissionQueryService],
})
export class PermissionModule {}
