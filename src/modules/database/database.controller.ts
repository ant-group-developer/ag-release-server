import { Controller, Get, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { DatabaseBackupService } from './services/database.backup.service';
import { QueryGetListBackup } from './dto/database.dto';

@Controller('database')
export class DatabaseController {
	constructor(private readonly databaseService: DatabaseBackupService) { }

	@Post()
	async create() {
		const data = await this.databaseService.handleCreate();
		return new ResponseSuccess({ data });
	}

	@Get()
	async getList(@Query() query: QueryGetListBackup) {
		const result = await this.databaseService.getList(query);
		return new ResponseSuccess({ data: result });
	}
}
