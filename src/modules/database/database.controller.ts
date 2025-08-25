import { Controller, Get, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	BackupMessageCodeSuccess,
	BackupMessageSuccess,
} from './constants/database.constants';
import { QueryGetListBackup } from './dto/database.dto';
import { DatabaseBackupService } from './services/database.backup.service';

@Controller('database')
export class DatabaseController {
	constructor(private readonly databaseService: DatabaseBackupService) {}

	@Post()
	create() {
		this.databaseService.handleCreateSafe();
		return new ResponseSuccess({
			messageCode: BackupMessageCodeSuccess.STARTED,
			message: BackupMessageSuccess.STARTED,
		});
	}

	@Get()
	async getList(@Query() query: QueryGetListBackup) {
		const result = await this.databaseService.getList(query);
		return new ResponseSuccess({ data: result });
	}
}
