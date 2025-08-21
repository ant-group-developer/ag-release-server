import { Controller, Get, Post } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { DatabaseBackupService } from './services/database.backup.service';

@Controller('database')
export class DatabaseController {
	constructor(private readonly databaseService: DatabaseBackupService) {}

	@Post()
	async create() {
		const data = await this.databaseService.handleCreate();
		return new ResponseSuccess({ data });
	}

	@Get()
	async getList() {
		const data = await this.databaseService.getList();
		return new ResponseSuccess({ data });
	}
}
