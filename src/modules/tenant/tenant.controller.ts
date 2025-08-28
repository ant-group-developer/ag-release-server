import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { TenantOwnerOrAdminOnly } from '../auth/decorators/auth.decorator';
import { TenantUserService } from '../user/services/tenant-user.service';
import { checkIsSystemAdmin } from '../user/utils/user-type.util';
import {
	CreateTenantDto,
	FindTenantsDto,
	UpdateTenantDto,
} from './dtos/tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
	constructor(
		private readonly tenantService: TenantService,
		private readonly TenantUserService: TenantUserService,
	) {}

	@Get()
	@ApiOperation({ summary: 'Get all tenants' })
	async findAll(
		@Query() query: FindTenantsDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const tenantId = req.user!.tenantId;
		const result = await this.tenantService.findAll(query, tenantId);
		return new ResponseSuccess({ data: result });
	}

	@Get('active')
	@ApiOperation({ summary: 'Get all tenants flatten which is actived' })
	async findAllFlattenActive(
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const result = await this.tenantService.findAllFlattenActive(
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.findOne(id, req.user!.tenantId);
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Post()
	async create(
		@Body() payload: CreateTenantDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.create(
			payload,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() { ownerId, ...payload }: UpdateTenantDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.update(
			id,
			payload,
			req.user!.tenantId,
		);
		if (ownerId && checkIsSystemAdmin(req.user!.type)) {
			await this.TenantUserService.updateOwner(result.id, ownerId);
		}
		return new ResponseSuccess({ data: result });
	}
}
