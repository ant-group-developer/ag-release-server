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
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { UserOrderBy, UserType } from '../enum/user.enum';

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
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/, {
		message:
			'Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, and one number.',
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
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/, {
		message:
			'Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, and one number.',
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

	@ApiPropertyOptional({ enum: UserType })
	@IsOptional()
	@IsEnum(UserType)
	type?: UserType;

	@ApiPropertyOptional()
	@IsOptional()
	@IsEnum(UserOrderBy)
	fieldOrder: UserOrderBy = UserOrderBy.UPDATED_AT;
}
