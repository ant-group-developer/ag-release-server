import { IsNotEmpty } from 'class-validator';

export class SignUpDto {
	@IsNotEmpty()
	userName: string;

	@IsNotEmpty()
	password: string;
}

export class LoginDto {
	@IsNotEmpty()
	userName: string;

	@IsNotEmpty()
	password: string;
}
