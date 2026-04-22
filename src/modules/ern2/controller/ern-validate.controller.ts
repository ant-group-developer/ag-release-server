// src/modules/ern/ern-validate.controller.ts
import { Body, Controller, Post } from '@nestjs/common';

import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import { ErnValidateService2 } from '../services/ern-validate.service';
import { ValidateErnDto2 } from '../validate-ern.dto';

@Controller('ern')
export class ErnValidateController2 {
	constructor(private readonly ernValidateService: ErnValidateService2) {}

	@PublicRoute()
	@Post('validate')
	async validate(@Body() dto: ValidateErnDto2) {
		return this.ernValidateService.validateFromFile(dto);
	}
}
