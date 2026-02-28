import { Body, Controller, Get, Put } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	PublicRoute,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { AppConfigService2 } from './app-config-v2.service';
import { UpdateConfigDto } from './dtos/app-config.dto';

@Controller('app-config/v2')
export class AppConfigController2 {
	constructor(private readonly appConfigService: AppConfigService2) {}

	@SystemAdminOnly()
	@Get()
	get() {
		const data = this.appConfigService.getCache();
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Get('/public')
	getPublic() {
		const data = this.appConfigService.getPublic();
		return new ResponseSuccess({ data });
	}

	@SystemAdminOnly()
	@Put()
	async update(@Body() payload: UpdateConfigDto) {
		const data = await this.appConfigService.update(payload);
		return new ResponseSuccess({ data });
	}
}
