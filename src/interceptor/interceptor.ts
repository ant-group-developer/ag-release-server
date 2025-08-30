import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const request = context.switchToHttp().getRequest();
		const userId = request.user?.sub;

		if (userId && request.body) {
			applyAudit(request.body, userId);
		}

		return next.handle();
	}
}

function applyAudit(obj: any, userId: string) {
	if (!obj || typeof obj !== 'object') return;

	// Nếu có field audit → gán
	if ('creatorId' in obj) obj.creatorId = userId;
	if ('modifierId' in obj) obj.modifierId = userId;

	// Nếu là array → duyệt từng phần tử
	if (Array.isArray(obj)) {
		obj.forEach((item) => applyAudit(item, userId));
	} else {
		// Nếu là object → duyệt qua từng key
		Object.keys(obj).forEach((key) => {
			if (typeof obj[key] === 'object') {
				applyAudit(obj[key], userId);
			}
		});
	}
}
