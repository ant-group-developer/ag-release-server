import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IAuthService } from './interface/auth.interface';

@Controller('auth')
export class AuthController implements IAuthService {
	constructor(private readonly authService: AuthService) {}

	// @Post('sign-up')
	// @Public()
	// async signUp(@Body() data: SignUpDto): Promise<IToken> {
	// 	return await this.authService.signUp(data);
	// }

	// @Post('login')
	// @Public()
	// async login(@Body() data: LoginDto): Promise<IToken> {
	// 	return await this.authService.login(data);
	// }
}
