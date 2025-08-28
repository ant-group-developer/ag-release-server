import { Body, Controller, Get, Put } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	PublicRoute,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { AppConfigService } from './app-config.service';
import { UpdateConfigDto } from './dtos/app-config.dto';
import { AppConfigKey } from './enums/app-config.enum';

@Controller('app-config')
export class AppConfigController {
	constructor(private readonly appConfigService: AppConfigService) {}

	@SystemAdminOnly()
	@Get()
	get() {
		const data = this.appConfigService.getValue(AppConfigKey.ALL);
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Get('/website')
	getWebsite() {
		const data = this.appConfigService.getValue(AppConfigKey.WEBSITE);
		return new ResponseSuccess({ data });
	}

	@SystemAdminOnly()
	@Put()
	async update(@Body() payload: UpdateConfigDto) {
		const data = await this.appConfigService.update(payload);
		return new ResponseSuccess({ data });
	}
}
