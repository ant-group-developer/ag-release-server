import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from 'src/modules/user/enum/user.enum';
import {
	AUTH_API_KEY,
	AUTH_PUBLIC,
	AUTH_USER_ACCESS,
} from '../decorators/auth0.decorator';
import Auth0JwtService from '../services/auth0-jwt.service';

@Injectable()
export class Auth0Guard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly auth0JwtService: Auth0JwtService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();

		// Check if authentication should be skipped
		if (this.isPublic(context)) {
			return true;
		}

		// Check if using API key authentication
		if (this.isApiKeyAuth(context)) {
			return this.validateApiKey(request);
		}

		// Regular JWT authentication
		return this.validateJwtAuth(context, request);
	}

	private isPublic(context: ExecutionContext): boolean {
		return this.getMetadata(AUTH_PUBLIC, context);
	}

	private isApiKeyAuth(context: ExecutionContext): boolean {
		return this.getMetadata(AUTH_API_KEY, context);
	}

	private isRegularUserAllowed(context: ExecutionContext): boolean {
		return this.getMetadata(AUTH_USER_ACCESS, context);
	}

	private getMetadata(key: string, context: ExecutionContext): boolean {
		return (
			this.reflector.get<boolean>(key, context.getHandler()) ||
			this.reflector.get<boolean>(key, context.getClass())
		);
	}

	private validateApiKey(request: any): boolean {
		const apiKeyEnv = process.env.API_KEY;
		const apiKey = request.headers['x-api-key'];

		if (!apiKey || apiKey !== apiKeyEnv) {
			throw new ForbiddenException('API key is missing or invalid');
		}

		return true;
	}

	private async validateJwtAuth(
		context: ExecutionContext,
		request: any,
	): Promise<boolean> {
		const authorization = request.headers.authorization;

		if (!authorization) {
			throw new UnauthorizedException('Authorization header is missing');
		}

		const userRequest =
			await this.auth0JwtService.validateAuthToken(authorization);

		if (
			this.isRegularUserAllowed(context) ||
			userRequest.type === UserType.ADMIN
		) {
			// Attach user to request object
			request.user = userRequest;
			return true;
		}

		throw new ForbiddenException(
			'You do not have permission to access this resource',
		);
	}
}
