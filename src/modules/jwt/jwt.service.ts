import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { IJwtPayload, IJwtService } from './interface/jwt.interface';

@Injectable()
export class JwtService implements IJwtService {
	private secret: string;

	constructor(
		private readonly jwtService: NestJwtService,
		private readonly configService: ConfigService,
	) {
		this.secret = this.configService.get<string>('JWT_SECRET')!;
	}

	generateAccessToken(payload: IJwtPayload): string {
		return this.jwtService.sign(payload, {
			secret: this.secret,
			expiresIn: '1h',
		});
	}

	generateRefreshToken(payload: IJwtPayload): string {
		return this.jwtService.sign(payload, {
			secret: this.secret,
			expiresIn: '7d',
		});
	}

	verifyToken(token: string): IJwtPayload | null {
		try {
			const decoded = this.jwtService.verify(token, {
				secret: this.secret,
			});

			return decoded as IJwtPayload;
		} catch (e) {
			return null;
		}
	}

	decodeToken(token: string): IJwtPayload | null {
		try {
			return this.jwtService.decode(token) as IJwtPayload;
		} catch (e) {
			return null;
		}
	}
}
