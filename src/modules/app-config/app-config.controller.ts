import { Body, Controller, Get, Put } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { UpdateConfigDto } from './app-config.dto';
import { AppConfigService } from './app-config.service';

@Controller('app-config')
export class AppConfigController {
	constructor(private readonly appConfigService: AppConfigService) {}

	@Get()
	async get() {
		const data = await this.appConfigService.get();
		return new ResponseSuccess({ data: data?.config });
	}

	@Put()
	async update(@Body() payload: UpdateConfigDto) {
		const data = await this.appConfigService.update(payload);
		return new ResponseSuccess({ data: data?.config });
	}
}
