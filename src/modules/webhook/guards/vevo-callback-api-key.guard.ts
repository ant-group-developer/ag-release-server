import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class VevoCallbackApiKeyGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const req = context.switchToHttp().getRequest<Request>();
		const apiKey = req.headers['x-api-key'];
		const expectedApiKey = process.env.VEVO_CALLBACK_API_KEY || '';

		if (typeof apiKey === 'string' && apiKey === expectedApiKey) {
			return true;
		}

		throw new UnauthorizedException('Invalid Vevo callback API key');
	}
}
