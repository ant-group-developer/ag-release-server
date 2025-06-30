import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateUserDto {
	@IsString()
	name: string;

	@IsEmail()
	email: string;

	@IsOptional()
	@IsString()
	telegramId: string | null;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class QueryGetListUserDto extends BaseQueryDto {}
