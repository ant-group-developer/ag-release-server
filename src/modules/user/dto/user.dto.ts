import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEmail,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Matches,
	ValidateNested,
} from 'class-validator';
import {
	CsvEnumArray,
	CsvIntArray,
	CsvUuidArray,
} from 'src/common/decorators/csv.decorators';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { TenantUserType, UserOrderBy, UserType } from '../enum/user.enum';

export abstract class UpdateUserDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@Length(3, 100)
	name?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@Length(8, 50)
	@IsString()
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S+$/, {
		message:
			'Password must be 8–50 characters, include at least one lowercase letter, one uppercase letter, and one number, and must not contain spaces.',
	})
	password?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsEmail()
	@Length(3, 50)
	email?: string;

	@ApiPropertyOptional({ type: 'string' })
	@IsOptional()
	@IsString()
	avatar?: string | null;

	@ApiPropertyOptional({ type: 'string' })
	@IsOptional()
	@IsString()
	telegramId?: string | null;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	emailVerified?: boolean;

	@ApiPropertyOptional({ enum: UserType })
	@IsOptional()
	@IsEnum(UserType)
	type?: UserType;
}

export class CreateUserDto extends UpdateUserDto {
	@ApiProperty()
	@Length(8, 50)
	@IsString()
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S+$/, {
		message:
			'Password must be 8–50 characters, include at least one lowercase letter, one uppercase letter, and one number, and must not contain spaces.',
	})
	password: string;

	@ApiProperty()
	@IsString()
	@Length(3, 100)
	name: string;

	@ApiProperty()
	@IsEmail()
	@Length(3, 50)
	email: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@ApiPropertyOptional({
		enum: [TenantUserType.ADMIN, TenantUserType.MEMBER],
	})
	@IsOptional()
	@IsEnum([TenantUserType.ADMIN, TenantUserType.MEMBER], {
		message: (option) =>
			`${option.property} must be ${TenantUserType.ADMIN} or ${TenantUserType.MEMBER} only`,
	})
	tenantUserType?: TenantUserType.ADMIN | TenantUserType.MEMBER;
}

export class GetListUserDto extends BaseQueryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	id?: string;

	@ApiPropertyOptional({
		description: 'List user types to filter (comma-separated)',
		example: 'a,b,c',
		required: false,
	})
	@CsvEnumArray(UserType)
	type?: UserType[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsEnum(UserOrderBy)
	fieldOrder: UserOrderBy = UserOrderBy.UPDATED_AT;

	@ApiPropertyOptional({
		description: 'Tenant IDs to filter users (comma-separated)',
		type: 'string',
		format: 'uuid',
	})
	@CsvUuidArray()
	tenantIds?: string[];

	@ApiPropertyOptional({
		description: 'User status to filter users (comma-separated)',
		type: 'number',
	})
	@CsvIntArray()
	status?: number[];
}

export class InviteUserToTenantDto {
	@ApiProperty()
	@IsEmail()
	@Length(3, 50)
	email: string;

	@ApiProperty({
		enum: [TenantUserType.ADMIN, TenantUserType.MEMBER],
	})
	@IsEnum([TenantUserType.ADMIN, TenantUserType.MEMBER], {
		message: (option) =>
			`${option.property} must be ${TenantUserType.ADMIN} or ${TenantUserType.MEMBER} only`,
	})
	type: TenantUserType.ADMIN | TenantUserType.MEMBER;
}

export class UpdateTenantUserDto {
	@ApiProperty({
		enum: [TenantUserType.ADMIN, TenantUserType.MEMBER],
	})
	@IsEnum([TenantUserType.ADMIN, TenantUserType.MEMBER], {
		message: (option) =>
			`${option.property} must be ${TenantUserType.ADMIN} or ${TenantUserType.MEMBER} only`,
	})
	type: TenantUserType.ADMIN | TenantUserType.MEMBER;

	@ApiProperty()
	@IsUUID()
	tenantId: string;
}

export class BulkUpdateTenantUserDto {
	@ApiProperty({ type: [UpdateTenantUserDto] })
	@ValidateNested({ each: true })
	@Type(() => UpdateTenantUserDto)
	@IsArray()
	data: UpdateTenantUserDto[];

	@ApiProperty()
	@IsUUID()
	userId: string;
}
