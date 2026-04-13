// src/modules/ern/ern-validate.controller.ts
import { Body, Controller, Post } from '@nestjs/common';

import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import { ErnValidateService } from '../services/ern-validate.service';
import { ValidateErnDto } from '../validate-ern.dto';

@Controller('ern')
export class ErnValidateController {
	constructor(private readonly ernValidateService: ErnValidateService) {}

	@PublicRoute()
	@Post('validate')
	async validate(@Body() dto: ValidateErnDto) {
		return this.ernValidateService.validateFromFile(dto);
	}
}
