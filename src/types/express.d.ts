import { UserFromRequest } from '../modules/token/token.interface';

declare module 'express-serve-static-core' {
	interface Request {
		user?: UserFromRequest;
	}
}
