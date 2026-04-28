import { Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { CiService } from '../services/ci.service';

@Controller('partners/ci/exports')
export class CiExportController {
	private readonly logger = new Logger(CiExportController.name);

	constructor(private readonly ciService: CiService) {}

	@Get(':exportId/deliver-desire')
	async deliverDesire(@Param('exportId') exportId: string) {
		return this.ciService.deliverDesire(exportId);
	}
}
