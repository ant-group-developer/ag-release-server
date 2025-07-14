import { Body, Controller, Get } from '@nestjs/common';
import { BackupDto } from './dto/database.dto';
import { DatabaseBackupService } from './services/database.backup.service';

@Controller('database')
export class DatabaseController {
	constructor(private readonly databaseService: DatabaseBackupService) {}

	@Get()
	async exportBackup(@Body() data: BackupDto) {
		await this.databaseService.backup(data);
	}
}
