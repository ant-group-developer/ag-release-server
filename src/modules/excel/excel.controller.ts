import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExcelService } from './excel.service';
@Controller('excel')
export class ExcelController {
	constructor(private readonly excelService: ExcelService) {}
	@Get('download-template')
	async downloadTemplate(@Res() res: Response) {
		await this.excelService.downloadTemplate(res);
	}
}
