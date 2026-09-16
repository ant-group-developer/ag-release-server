import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class VevoQueueWebhookSecretGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();

		const receivedSecret = request.headers['x-vevo-secret'];

		const expectedSecret = process.env.VEVO_QUEUE_WEBHOOK_SECRET;

		if (
			!expectedSecret ||
			typeof receivedSecret !== 'string' ||
			receivedSecret !== expectedSecret
		) {
			throw new UnauthorizedException(
				'Invalid VEVO queue webhook secret',
			);
		}

		return true;
	}
}
