import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY, Permission } from '../auth.constants';

export const Permissions = (...perms: Permission[]) =>
	SetMetadata(PERMISSIONS_KEY, perms);
export const AdminOnly = () => Permissions('admin');
