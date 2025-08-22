import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsString,
	IsUUID,
	Length,
	Matches,
	ValidateIf,
} from 'class-validator';
import { SYSTEM_TENANT_ID } from '../tenant/tenant.constant';

export class SiginDto {
	@ApiProperty()
	@Length(8, 50)
	@IsString()
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S+$/, {
		message:
			'Password must be at least 8, include at least one lowercase letter, one uppercase letter, and one number, and must not contain spaces.',
	})
	password: string;

	@ApiProperty()
	@IsEmail()
	@Length(3, 50)
	email: string;
}

export class RefreshDto {
	@ApiProperty({
		description: 'JWT refresh token',
		example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
	})
	@IsString()
	refreshToken: string;
}

export class SwitchTenantDto {
	@ApiProperty()
	@ValidateIf((obj, value) => value !== SYSTEM_TENANT_ID)
	@IsUUID('4')
	tenantId: string;
}
