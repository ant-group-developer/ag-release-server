import { Controller, Get, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';

import { QueryGetListDspActionDto } from './interface/dsp-action.interface';
import { DspActionService } from './services/dsp-action.service';

@Controller('dsp-actions')
export class DspActionController {
	constructor(private readonly dspActionService: DspActionService) {}

	@Get()
	async getList(@Query() query: QueryGetListDspActionDto) {
		const result = await this.dspActionService.getList(query);
		return new ResponseSuccess({ data: result });
	}
}
