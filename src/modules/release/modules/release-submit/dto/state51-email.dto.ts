import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

export enum FieldOrderState51Email {
	email_createdAt = 'email.createdAt',
	email_updatedAt = 'email.updatedAt',
	email_isSent = 'email.isSent',
	email_sentAt = 'email.sentAt',
}

export class CreateState51EmailDto {
	@IsOptional()
	@IsString()
	upc: string | null;

	@IsArray()
	@IsString({ each: true })
	dspCiCodes: string[];

	@IsUUID()
	releaseId: string;

	@IsUUID()
	releaseSubmitStepId: string;

	@IsEmail()
	deliveryEmail: string;

	@IsOptional()
	@IsString()
	deliveryEmailSubject?: string | null;
}

export class UpdateState51EmailDto {
	@IsOptional()
	@IsString()
	upc?: string | null;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	dspCiCodes?: string[];

	@IsOptional()
	@IsBoolean()
	isSent?: boolean;

	@IsOptional()
	@IsEmail()
	deliveryEmail?: string;

	@IsOptional()
	@IsString()
	deliveryEmailSubject?: string | null;
}

export class QueryGetListState51EmailDto extends BaseQueryDto2 {
	@IsOptional()
	@IsBoolean()
	@IsString() // TypeORM often receives booleans as strings from query params
	isSent?: string | boolean;

	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@IsOptional()
	@IsString()
	upc?: string;

	@IsEnum(FieldOrderState51Email)
	fieldOrder: string = FieldOrderState51Email.email_createdAt;
}

export class BatchSendEmailDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
