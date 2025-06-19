export interface IAuthService {
	// signUp(data: SignUpDto): Promise<IToken>;
	// login(data: LoginDto): Promise<IToken>;
	// logout(): void;
	// resetPassword(): void;
}

export interface IToken {
	accessToken: string;
	refreshToken: string;
}
