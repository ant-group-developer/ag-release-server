import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserId = createParamDecorator(
	(data: unknown, ctx: ExecutionContext): string => {
		const request = ctx.switchToHttp().getRequest();
		return request.user!.sub;
	},
);

export const User = createParamDecorator(
	(data: unknown, ctx: ExecutionContext): string => {
		const request = ctx.switchToHttp().getRequest();
		return request.user;
	},
);
