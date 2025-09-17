import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTier } from './entities/tenant-tiers.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TenantTier])],
})
export class TenantTierModule {}
