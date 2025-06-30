import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Organization } from '../organization/entities/organization.entity';
import { OrganizationDsp } from './entities/organization-dsp.entity';
import { OrganizationDspController } from './organization-dsp.controller';
import { OrganizationDspService } from './services/organization-dsp.service';
import { OrganizationDspValidateService } from './services/organization-dsp.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([OrganizationDsp, Dsp, Organization])],
	controllers: [OrganizationDspController],
	providers: [OrganizationDspService, OrganizationDspValidateService],
})
export class OrganizationDspModule {}
