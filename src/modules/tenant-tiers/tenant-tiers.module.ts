import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTier } from './entities/tenant-tiers.entity';
import { TenantTierQueryService } from './services/tenant-tier.query.service';
import { TenantTierService } from './services/tenant-tier.service';
import { TenantTierController } from './tenant-tier.controller';

@Module({
	imports: [TypeOrmModule.forFeature([TenantTier])],
	controllers: [TenantTierController],
	providers: [TenantTierService, TenantTierQueryService],
	exports: [TenantTierService, TenantTierQueryService],
})
export class TenantTierModule {}
