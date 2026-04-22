import { Module } from '@nestjs/common';
import { ErnValidateController2 } from './controller/ern-validate.controller';
import { ErnController2 } from './controller/ern.controller';
import { ErnValidateService2 } from './services/ern-validate.service';
import { ErnService2 } from './services/ern.service';

@Module({
	controllers: [ErnController2, ErnValidateController2],
	providers: [ErnService2, ErnValidateService2],
	exports: [ErnService2],
})
export class ErnModule2 {}
