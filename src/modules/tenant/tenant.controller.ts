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
import {
	TenantOwnerOrAdminOnly,
	TenantWhiteLabelOnly,
} from '../auth/decorators/auth.decorator';
import { TenantUserService } from '../user/services/tenant-user.service';
import {
	checkIsNotSystemAdmin,
	checkIsSystemAdmin,
} from '../user/utils/user-type.util';
import {
	CreateTenantDto,
	FindTenantsDto,
	UpdateTenantDto,
} from './dtos/tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantType } from './tenant.enum';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
	constructor(
		private readonly tenantService: TenantService,
		private readonly tenantUserService: TenantUserService,
	) {}

	@TenantOwnerOrAdminOnly()
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

	@Get('simple')
	async getListSimple() {
		const data = await this.tenantService.getListSimple();
		return new ResponseSuccess({ data });
	}

	@Get('active')
	@ApiOperation({ summary: 'Get all tenants flatten which is actived' })
	async findAllFlattenActive(
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const result = await this.tenantService.findAllFlattenActive(req);
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Get(':id')
	async findOne(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.findOne(id, req.user!.tenantId);
		return new ResponseSuccess({ data: result });
	}

	@TenantWhiteLabelOnly()
	@TenantOwnerOrAdminOnly()
	@Post()
	async create(
		@Body() payload: CreateTenantDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const tenantId = req.user!.tenantId;
		const userType = req.user!.type;
		const userReqId = req.user!.sub;

		if (checkIsNotSystemAdmin(userType)) {
			payload.type = TenantType.LABEL;
			payload.parentId = tenantId;
		}

		const result = await this.tenantService.create(
			payload,
			req.user!.tenantId,
			userReqId,
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
		const userType = req.user!.type;
		const userReqId = req.user!.sub;

		if (checkIsNotSystemAdmin(userType)) {
			delete payload.type;
			delete payload.parentId;
		}

		const result = await this.tenantService.update(
			id,
			payload,
			req.user!.tenantId,
			userReqId,
		);

		const isOwnerParentTenant =
			await this.tenantUserService.checkIsOwnerParentTenant(
				req.user!.id,
				result.parent?.id,
			);
		if (ownerId && (isOwnerParentTenant || checkIsSystemAdmin(userType))) {
			await this.tenantUserService.updateOwner(
				result.id,
				ownerId,
				userReqId,
			);
		}

		return new ResponseSuccess({ data: result });
	}
}
