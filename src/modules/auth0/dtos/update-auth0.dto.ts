import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsString } from 'class-validator';

export class UpdateAuth0Dto {
	@ApiProperty()
	@IsString()
	clientId: string;

	@ApiProperty()
	@IsString()
	clientSecret: string;

	@ApiProperty()
	@IsString()
	domain: string;

	@ApiProperty()
	@IsString()
	audience: string;
}

export class UpdateAuth0Token {
	@ApiProperty()
	@IsString()
	token: string;

	@ApiProperty()
	@IsDate()
	tokenExpiresAt: Date;
}
