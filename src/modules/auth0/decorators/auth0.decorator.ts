import { SetMetadata } from '@nestjs/common';

// Auth metadata keys - using consistent naming pattern
export const AUTH_PUBLIC = 'auth:public';
export const AUTH_API_KEY = 'auth:apiKey';
export const AUTH_USER_ACCESS = 'auth:userAccess';
export const AUTH_ADMIN_ACCESS = 'auth:adminAccess';

// Decorators with more semantic names
export const Public = () => SetMetadata(AUTH_PUBLIC, true);
export const ApiKeyAuth = () => SetMetadata(AUTH_API_KEY, true);
export const AllowRegularUsers = () => SetMetadata(AUTH_USER_ACCESS, true);
export const AllowAdminOnly = () => SetMetadata(AUTH_ADMIN_ACCESS, true);
