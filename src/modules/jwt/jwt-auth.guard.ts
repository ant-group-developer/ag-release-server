import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from './jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly jwtService: JwtService,
		private readonly reflector: Reflector,
	) {}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this.reflector.get<boolean>(
			'isPublic',
			context.getHandler(),
		);

		if (isPublic) {
			return true;
		}

		const request = context.switchToHttp().getRequest();
		const token = request.headers['authorization']?.split(' ')[1];

		if (!token) {
			return false;
		}

		const decoded = this.jwtService.verifyToken(token);

		if (!decoded) {
			return false;
		}

		request.user = decoded;
		return true;
	}
}
