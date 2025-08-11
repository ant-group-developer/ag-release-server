import { SetMetadata } from '@nestjs/common';
import { TENANT_OWNER_ONLY_KEY } from '../auth.constants';

export const TenantOwnerOnly = () => SetMetadata(TENANT_OWNER_ONLY_KEY, true);
