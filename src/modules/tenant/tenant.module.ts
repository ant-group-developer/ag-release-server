import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { UserModule } from '../user/user.module';
import { TenantController } from './tenant.controller';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Tenant]),
		forwardRef(() => UserModule),
		forwardRef(() => AccessControlModule),
	],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService],
})
export class TenantModule {}
