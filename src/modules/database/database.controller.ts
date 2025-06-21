import { Controller, Get } from '@nestjs/common';
import { DatabaseBackupService } from './services/database.backup-service';

@Controller('database')
export class DatabaseController {
	constructor(private readonly databaseService: DatabaseBackupService) {}

	@Get()
	async exportBackup() {
		await this.databaseService.exportBackup();
	}
}
