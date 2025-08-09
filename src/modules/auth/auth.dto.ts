import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

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
