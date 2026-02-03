import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspModule } from '../dsp/dsp.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantDspController } from './tenant-dsp.controller';
import { TenantDsp } from './tenant-dsp.entity';
import { TenantDspService } from './tenant-dsp.service';

@Module({
	imports: [TypeOrmModule.forFeature([TenantDsp]), DspModule, TenantModule],
	controllers: [TenantDspController],
	providers: [TenantDspService],
	exports: [TenantDspService],
})
export class TenantDspModule {}
