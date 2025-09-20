import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { FieldOrderBackup, StatusBackup } from '../enums/database.enum';

export class BackupDto {
	@IsOptional()
	@IsBoolean()
	toDrive?: boolean;

	@IsOptional()
	@IsBoolean()
	toGcs?: boolean;
}

export class QueryGetListBackup extends BaseQueryDto {
	@IsEnum(StatusBackup)
	@IsOptional()
	status?: StatusBackup;

	@IsEnum(FieldOrderBackup)
	fieldOrder: FieldOrderBackup = FieldOrderBackup.CREATED_AT;

	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
