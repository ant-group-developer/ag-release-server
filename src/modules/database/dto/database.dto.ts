import { IsBoolean, IsOptional } from 'class-validator';

export class BackupDto {
	@IsOptional()
	@IsBoolean()
	toDrive?: boolean;

	@IsOptional()
	@IsBoolean()
	toGcs?: boolean;
}
