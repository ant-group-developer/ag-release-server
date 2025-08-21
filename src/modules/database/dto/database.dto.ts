import { IsBoolean, IsOptional } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class BackupDto {
	@IsOptional()
	@IsBoolean()
	toDrive?: boolean;

	@IsOptional()
	@IsBoolean()
	toGcs?: boolean;
}

export class QueryGetListBackup extends BaseQueryDto {}
