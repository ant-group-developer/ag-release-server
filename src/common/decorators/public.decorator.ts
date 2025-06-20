import { SetMetadata } from '@nestjs/common';

// Auth metadata keys - using consistent naming pattern
export const AUTH_PUBLIC = 'auth:public';
export const AUTH_API_KEY = 'auth:apiKey';
export const AUTH_ADMIN_ONLY = 'auth:adminOnly';

// Decorators with more semantic names
export const PublicRoute = () => SetMetadata(AUTH_PUBLIC, true);
export const ApiKeyRoute = () => SetMetadata(AUTH_API_KEY, true);
export const AdminRoute = () => SetMetadata(AUTH_ADMIN_ONLY, true);
