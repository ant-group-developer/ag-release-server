import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { RequirePermissions } from '../auth/decorators/auth.decorator';
import { Permission } from '../permission/constants/permission.data.constant';
import { UpdateTenantDspDto } from './tenant-dsp.dto';
import { TenantDspService } from './tenant-dsp.service';

@ApiTags('Tenant DSP')
@Controller('tenants/dsps')
export class TenantDspController {
	constructor(private readonly tenantDspService: TenantDspService) {}

	@RequirePermissions(Permission.DSP_TENANT.READ)
	@ApiOperation({ summary: 'Update list dsp that tenant can access' })
	@Post()
	async update(@Body() payload: UpdateTenantDspDto) {
		const data = await this.tenantDspService.update(payload);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Get list dsp that tenant can access' })
	@ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
	@Get(':tenantId')
	async get(@Param('tenantId') tenantId: string) {
		const data = await this.tenantDspService.get(tenantId);
		return new ResponseSuccess({ data });
	}
}
