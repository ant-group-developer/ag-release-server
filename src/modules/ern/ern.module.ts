import { Module } from '@nestjs/common';
import { ErnValidateController } from './ern-validate.controller';
import { ErnValidateService } from './ern-validate.service';
import { ErnController } from './ern.controller';
import { ErnService } from './ern.service';

@Module({
	controllers: [ErnController, ErnValidateController],
	providers: [ErnService, ErnValidateService],
	exports: [ErnService],
})
export class ErnModule {}
