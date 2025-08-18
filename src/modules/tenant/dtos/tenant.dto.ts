import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
} from 'class-validator';
import { CsvEnumArray } from 'src/common/decorators/csv.decorators';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { TenantOrderBy, TenantType } from '../tenant.enum';

export abstract class UpdateTenantDto {
	@ApiPropertyOptional({
		example: 'https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	@IsOptional()
	@IsString()
	@Length(3, LENGTH_PICTURE)
	logo?: string;

	@ApiPropertyOptional({
		example: 'https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	@IsOptional()
	@IsString()
	@Length(3, LENGTH_PICTURE)
	icon?: string;

	@ApiPropertyOptional({
		example: 'ANT Music - Distribution Unlimited Music All Platform',
	})
	@IsOptional()
	@IsString()
	@Length(3, 100)
	title?: string;

	@ApiPropertyOptional({
		example: 'ANT Music',
	})
	@IsOptional()
	@IsString()
	@Length(3, 50)
	name?: string;

	@ApiPropertyOptional({
		description: 'The domain must be without http:// or https://',
	})
	@IsOptional()
	@IsString()
	@Length(3, 50)
	domain?: string;

	@ApiPropertyOptional({
		description: 'This email will be used to send notifications',
	})
	@IsOptional()
	@IsEmail()
	@Length(3, 50)
	email?: string;

	@ApiPropertyOptional({
		example: '#4540BF',
	})
	@IsOptional()
	@IsString()
	@Length(3, 10)
	primaryColor?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	// @ApiPropertyOptional()
	// @IsOptional()
	// @IsUUID()
	// ownerId?: string;

	@ApiPropertyOptional({ enum: TenantType })
	@IsOptional()
	@IsEnum(TenantType)
	type?: TenantType;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID()
	parentId?: string;
}

export class CreateTenantDto extends UpdateTenantDto {
	@ApiProperty({
		example: 'ANT Music',
	})
	@IsString()
	@Length(3, 50)
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'This email will be used to send notifications',
	})
	@IsEmail()
	@Length(3, 50)
	@IsNotEmpty()
	email: string;

	@ApiProperty()
	@IsUUID()
	@IsNotEmpty()
	ownerId: string;

	@ApiProperty({ enum: TenantType })
	@IsEnum(TenantType)
	@IsNotEmpty()
	type: TenantType;

	@ApiPropertyOptional({
		example: 'https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	@IsOptional()
	@IsString()
	@Length(3, LENGTH_PICTURE)
	logo?: string;

	@ApiPropertyOptional({
		example: 'https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	@IsOptional()
	@IsString()
	@Length(3, LENGTH_PICTURE)
	icon?: string;

	@ApiPropertyOptional({
		example: 'ANT Music - Distribution Unlimited Music All Platform',
	})
	@IsOptional()
	@IsString()
	@Length(3, 100)
	title?: string;

	@ApiPropertyOptional({
		description: 'The domain must be without http:// or https://',
	})
	@IsOptional()
	@IsString()
	@Length(3, 50)
	domain?: string;

	@ApiPropertyOptional({
		example: '#4540BF',
	})
	@IsOptional()
	@IsString()
	@Length(3, 10)
	primaryColor?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID()
	parentId?: string;
}

export class FindTenantsDto extends BaseQueryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	id?: string;

	@ApiPropertyOptional({
		description: 'List user types to filter (comma-separated)',
		example: 'a,b,c',
		required: false,
	})
	@CsvEnumArray(TenantType)
	type?: TenantType[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsEnum(TenantOrderBy)
	fieldOrder: TenantOrderBy = TenantOrderBy.CREATED_AT;
}
