import { Injectable } from '@nestjs/common';
import { JwtService } from 'src/jwt/jwt.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		private readonly userService: UserService,
	) {}

	// async signUp(user: SignUpDto): Promise<IToken> {
	// 	const newUser = await this.userService.createUser(user);

	// 	const payload: IJwtPayload = {
	// 		userId: newUser.id,
	// 		username: newUser.userName,
	// 	};

	// 	const accessToken = this.jwtService.generateAccessToken(payload);
	// 	const refreshToken = this.jwtService.generateRefreshToken(payload);
	// 	return { accessToken, refreshToken };
	// }

	// async login(data: LoginDto): Promise<IToken> {
	// 	const { password } = data;

	// 	const user = await this.userService.findOne(data);

	// 	const validPassword = await validatePassword({
	// 		providedPassword: password,
	// 		storedPassword: user.password,
	// 	});

	// 	if (!validPassword) {
	// 		throw new BadRequestException('Invalid username or password');
	// 	}

	// 	const payload: IJwtPayload = {
	// 		userId: user.id,
	// 		username: user.userName,
	// 	};

	// 	const accessToken = this.jwtService.generateAccessToken(payload);
	// 	const refreshToken = this.jwtService.generateRefreshToken(payload);

	// 	return { accessToken, refreshToken };
	// }
}
