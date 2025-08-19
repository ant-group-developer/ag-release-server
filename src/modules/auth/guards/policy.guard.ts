import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ResponseError } from 'src/common/dtos/response.dto';
import {
	checkIsSystemAdmin,
	checkIsTenantOwner,
	checkIsTenantOwnerOrAdmin,
} from 'src/modules/user/utils/user-type.util';
import {
	AUTH_PERMISSIONS_KEY,
	AUTH_PUBLIC_KEY,
	AUTH_SYSTEM_ADMIN_ONLY,
	AUTH_TENANT_OWNER_ONLY_KEY,
	AUTH_TENANT_OWNER_OR_ADMIN_ONLY_KEY,
	Permission,
} from '../constants/key';
import {
	AuthMessages,
	buildInsufficientPermissionsMessage,
} from '../constants/messages';

@Injectable()
export class PolicyGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const handler = context.getHandler();
		const clazz = context.getClass();

		/** 1) Public route */
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			AUTH_PUBLIC_KEY,
			[handler, clazz],
		);
		if (isPublic) return true;

		/** 2) User presence */
		const req = context.switchToHttp().getRequest<Request>();
		const user = req.user;
		if (!user) throw new ResponseError(AuthMessages.UNAUTHORIZED);

		const isSysAdmin = checkIsSystemAdmin(user.type);

		/** 3) System admins bypass remaining checks */
		if (isSysAdmin) return true;

		/** 4) SystemAdminOnly — strictly enforce */
		const systemAdminOnly =
			this.reflector.getAllAndOverride<boolean>(AUTH_SYSTEM_ADMIN_ONLY, [
				handler,
				clazz,
			]) ?? false;

		if (systemAdminOnly) {
			throw new ResponseError(AuthMessages.SYSTEM_ADMIN_ONLY);
		}

		// Require tenantId because get user's permissions by tenantId and userId
		if (!user.tenantId) {
			throw new ResponseError(AuthMessages.TENANT_ID_REQUIRED);
		}

		/** 5) Permissions (ANY-of) */
		const requiredPerms =
			this.reflector.getAllAndOverride<Permission[]>(
				AUTH_PERMISSIONS_KEY,
				[handler, clazz],
			) ?? [];

		if (requiredPerms.length) {
			const userPerms = new Set<string>(
				Array.isArray(user.permission) ? user.permission : [],
			);
			const hasAny = requiredPerms.some((p) => userPerms.has(p));
			if (!hasAny) {
				throw new ResponseError(
					buildInsufficientPermissionsMessage(requiredPerms),
				);
			}
		}

		/** 6) Tenant gates */
		const tenantOwnerOnly =
			this.reflector.getAllAndOverride<boolean>(
				AUTH_TENANT_OWNER_ONLY_KEY,
				[handler, clazz],
			) ?? false;

		const tenantOwnerOrAdminOnly =
			this.reflector.getAllAndOverride<boolean>(
				AUTH_TENANT_OWNER_OR_ADMIN_ONLY_KEY,
				[handler, clazz],
			) ?? false;

		if (tenantOwnerOrAdminOnly) {
			const ok = checkIsTenantOwnerOrAdmin(user.tenantType);
			if (!ok) {
				throw new ResponseError(
					AuthMessages.TENANT_OWNER_OR_ADMIN_ONLY,
				);
			}
		}

		if (tenantOwnerOnly) {
			const ok = checkIsTenantOwner(user.tenantType);
			if (!ok) {
				throw new ResponseError(AuthMessages.TENANT_OWNER_ONLY);
			}
		}

		if (tenantOwnerOrAdminOnly) {
			const ok = checkIsTenantOwnerOrAdmin(user.tenantType);
			if (!ok) {
				throw new ResponseError(
					AuthMessages.TENANT_OWNER_OR_ADMIN_ONLY,
				);
			}
		}

		return true;
	}
}
