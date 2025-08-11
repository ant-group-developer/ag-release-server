import {
	BadRequestException,
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
	IS_PUBLIC_KEY,
	Permission,
	PERMISSIONS_KEY,
	TENANT_OWNER_ONLY_KEY,
} from '../auth.constants';
// Implement this in your tenants module and export the service:

function extractTenantId(req: Request): string | undefined {
	const p = req.params as any,
		q = req.query as any,
		b = req.body,
		h = req.headers as any;
	return (
		p?.tenantId ??
		p?.tenant ??
		q?.tenantId ??
		q?.tenant ??
		b?.tenantId ??
		b?.tenant ??
		h?.['x-tenant-id']
	);
}

@Injectable()
export class PolicyGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		// private readonly tenants: TenantsService, // ensure it's provided by TenantsModule
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			IS_PUBLIC_KEY,
			[context.getHandler(), context.getClass()],
		);
		if (isPublic) return true;

		const req = context.switchToHttp().getRequest<Request>();
		const user = req.user as
			| { sub: string; permissions?: Permission[] | Permission }
			| undefined;
		if (!user) throw new ForbiddenException('Authentication required');

		const requiredPerms =
			this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
				context.getHandler(),
				context.getClass(),
			]) || [];

		const tenantOwnerOnly =
			this.reflector.getAllAndOverride<boolean>(TENANT_OWNER_ONLY_KEY, [
				context.getHandler(),
				context.getClass(),
			]) || false;

		if (!requiredPerms.length && !tenantOwnerOnly) return true;

		const userPerms = new Set(
			(Array.isArray(user.permissions)
				? user.permissions
				: [user.permissions]
			).filter(Boolean) as string[],
		);

		if (requiredPerms.length) {
			const ok = requiredPerms.some((p) => userPerms.has(p)); // ANY-of
			if (!ok)
				throw new ForbiddenException('Missing required permission');
		}

		if (tenantOwnerOnly) {
			if (userPerms.has('admin')) return true; // admin bypass
			const tenantId = extractTenantId(req);
			if (!tenantId) throw new BadRequestException('Missing tenantId');
			// const isOwner = await this.tenants.isOwner(
			// 	user.sub,
			// 	String(tenantId),
			// );
			const isOwner = true;
			if (!isOwner) throw new ForbiddenException('Tenant owner required');
		}

		return true;
	}
}
