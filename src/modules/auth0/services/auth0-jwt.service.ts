import {
	HttpException,
	HttpStatus,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { UserRequestDto } from 'src/modules/user/dto/user-request.dto';
import { UserService } from 'src/modules/user/services/user.service';
import * as util from 'util';
import { getIdUserFromPayload } from '../auth0.util';
import { Auth0TokenPayload } from '../token-payload.interface';

@Injectable()
export default class Auth0JwtService {
	constructor(private readonly userService: UserService) {}

	async validateAuthToken(authToken: string): Promise<UserRequestDto> {
		const tokenString = this.extractTokenFromHeader(authToken);
		const decodedToken = this.parseAndValidateToken(tokenString);
		const jwksClient = new JwksClient({
			cache: true,
			rateLimit: true,
			jwksRequestsPerMinute: 5,
			jwksUri: `${process.env.AUTH0_ISSUER_URL}.well-known/jwks.json`,
		});
		const getSigningKey = util.promisify(jwksClient.getSigningKey);

		try {
			const key: any = await getSigningKey(decodedToken.header.kid);
			const signingKey = key.publicKey || key.rsaPublicKey;
			return this.verifyTokenSignature(
				tokenString,
				signingKey,
				decodedToken,
			);
		} catch (err) {
			throw new UnauthorizedException(err);
		}
	}

	private verifyTokenSignature(
		tokenString: string,
		signingKey: string,
		decodedToken: any,
	): Promise<UserRequestDto> {
		try {
			jwt.verify(tokenString, signingKey);
			const { payload } = decodedToken;
			return this.getUserRequest(payload);
		} catch (err) {
			throw new UnauthorizedException(err);
		}
	}

	private parseAndValidateToken(tokenString: string) {
		const decodedToken = jwt.decode(tokenString, {
			complete: true,
			json: true,
		});
		if (!decodedToken || !decodedToken.header || !decodedToken.header.kid) {
			throw new HttpException(
				{ message: 'INVALID_AUTH_TOKEN' },
				HttpStatus.UNAUTHORIZED,
			);
		}
		return decodedToken;
	}

	private extractTokenFromHeader(authHeader: string): string {
		const match = authHeader.match(/^Bearer (.*)$/);
		if (!match || match.length < 2) {
			throw new HttpException(
				{ message: 'INVALID_BEARER_TOKEN' },
				HttpStatus.UNAUTHORIZED,
			);
		}
		return match[1];
	}

	private async getUserRequest(
		payload: Auth0TokenPayload,
	): Promise<UserRequestDto> {
		const userId = getIdUserFromPayload(payload);
		const user = await this.userService.findOne(userId);

		return new UserRequestDto({
			type: user.type,
			authO0ClientId: payload.azp || '',
			email: user.email,
			id: user.id,
		});
	}
}
