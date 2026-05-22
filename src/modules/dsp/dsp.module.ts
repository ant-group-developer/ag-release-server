import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { SftpConfigsModule } from '../distribution/sftp-configs/sftp-config.module';
import { DspActionModule } from '../dsp-action/dsp-action.module';
import { DspAction } from '../dsp-action/entities/dsp-action.entities';
import { TenantDspAgreementController } from './dsp-tenant.controller';
import { DspController } from './dsp.controller';
import { TenantDspAgreement } from './entities/dsp-tenant.entity';
import { Dsp } from './entities/dsp.entity';
import { TenantDspAgreementService } from './services/dsp-tenant.service';
import { DspQueryService } from './services/dsp.query.service';
import { DspService } from './services/dsp.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Dsp, DspAction, TenantDspAgreement]),
		BucketModule2,
		DspActionModule,
		DspRoutingConfigsModule,
		SftpConfigsModule,
	],
	controllers: [DspController, TenantDspAgreementController],
	providers: [DspService, DspQueryService, TenantDspAgreementService],
	exports: [DspService, DspQueryService, TenantDspAgreementService],
})
export class DspModule {}
