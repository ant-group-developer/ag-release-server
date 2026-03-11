// src/auth/guards/jwt-auth.guard.ts
import {
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AUTH_PUBLIC_KEY } from '../constants/key';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private readonly reflector: Reflector) {
		super();
	}

	canActivate(context: ExecutionContext) {
		const isPublic =
			this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC_KEY, [
				context.getHandler(),
				context.getClass(),
			]) ?? false;
		if (isPublic) return true;

		const req = context.switchToHttp().getRequest<Request>();

		const apiKey = req.headers['x-api-key'];

		if (
			typeof apiKey === 'string' &&
			apiKey === process.env.INTERNAL_API_KEY
		) {
			(req as any).user = {
				id: 'internal-service',
				type: 'system_admin',
				permission: ['internal:*'],
				tenantId: null,
			};

			(req as any).authType = 'api-key';
			return true;
		}

		return super.canActivate(context);
	}

	handleRequest(err: any, user: any, info: any) {
		if (err || !user) {
			if (err?.response?.statusCode) {
				throw new ResponseError(err.response);
			} else {
				throw new UnauthorizedException(info);
			}
		}
		return user;
	}
}
