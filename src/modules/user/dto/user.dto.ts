import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEmail,
	IsEnum,
	IsOptional,
	IsString,
	Length,
	Matches,
} from 'class-validator';
import { CsvEnumArray } from 'src/common/decorators/csv.decorators';
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

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	avatar?: string | null;

	@ApiPropertyOptional()
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
}

export class GetListUserDto extends BaseQueryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	id?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	tenantId?: string;

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
}

export class InviteUserToTenantDto {
	@ApiProperty()
	@IsEmail()
	@Length(3, 50)
	email: string;

	@ApiPropertyOptional({ enum: TenantUserType })
	@IsOptional()
	@IsEnum(TenantUserType)
	type?: TenantUserType;
}
