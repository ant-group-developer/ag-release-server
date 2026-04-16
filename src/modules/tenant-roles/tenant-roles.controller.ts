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
@Controller('tenants/roles')
export class TenantRolesController {
	constructor(private readonly tenantRolesService: TenantRolesService) {}

	@SystemAdminOnly()
	@ApiOperation({ summary: 'Update list roles that tenant can access' })
	@Post()
	async update(@Body() payload: UpdateTenantRolesDto) {
		const data = await this.tenantRolesService.update(payload);
		return new ResponseSuccess({ data });
	}

	// @SystemAdminOnly()
	@ApiOperation({ summary: 'Get list roles configured for a tenant' })
	@ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
	@Get(':tenantId')
	async get(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
		const data = await this.tenantRolesService.get(tenantId);
		return new ResponseSuccess({ data });
	}
}
