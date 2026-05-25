import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { UpdateTenantRolesDto } from './tenant-roles.dto';
import { TenantRolesService } from './tenant-roles.service';

@ApiTags('Tenant Roles')
@Controller('tenants')
export class TenantRolesController {
	constructor(private readonly tenantRolesService: TenantRolesService) {}

	@SystemAdminOnly()
	@ApiOperation({ summary: 'Update roles configuration for a tenant' })
	@Post(':tenantId/configured-roles')
	async update(
		@Param('tenantId', ParseUUIDPipe) tenantId: string,
		@Body() payload: UpdateTenantRolesDto,
	) {
		const data = await this.tenantRolesService.update(tenantId, payload);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Get roles configured for a tenant' })
	@ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
	@Get(':tenantId/configured-roles')
	async get(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
		const data = await this.tenantRolesService.getEnabledRoleIds(tenantId);
		return new ResponseSuccess({ data });
	}
}
