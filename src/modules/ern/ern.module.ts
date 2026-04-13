import { Module } from '@nestjs/common';
import { ErnValidateController } from './controller/ern-validate.controller';
import { ErnController } from './controller/ern.controller';
import { ErnValidateService } from './services/ern-validate.service';
import { ErnService } from './services/ern.service';

@Module({
	controllers: [ErnController, ErnValidateController],
	providers: [ErnService, ErnValidateService],
	exports: [ErnService],
})
export class ErnModule {}
