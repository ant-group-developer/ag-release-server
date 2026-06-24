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
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { OrderDirection } from 'src/common/enums/common';
import {
	RequirePermissions,
	TenantWhiteLabelOnly,
} from '../auth/decorators/auth.decorator';
import { Permission } from '../permission/constants/permission.data.constant';
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
import { SYSTEM_TENANT_ID } from './tenant.constant';
import { Tenant } from './tenant.entity';
import { TenantOrderBy, TenantType } from './tenant.enum';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
	constructor(
		private readonly tenantService: TenantService,
		private readonly tenantUserService: TenantUserService,
	) {}

	@RequirePermissions(Permission.WORKSPACE.READ)
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
	async findAllActive(
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const tenantId = checkIsSystemAdmin(req.user!.type)
			? SYSTEM_TENANT_ID
			: req.user!.tenantId;
		const result = await this.tenantService.findAll(
			{
				isActive: true,
				fieldOrder: TenantOrderBy.NAME,
				page: 1,
				pageSize: 999,
				skip: 0,
				limit: 999,
				orderBy: OrderDirection.ASC,
			},
			tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get('active/accessible')
	@ApiOperation({
		summary: 'Get active tenants accessible by current user tenant',
	})
	async findAllActiveAccessible(
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const result = await this.tenantService.findAll(
			{
				isActive: true,
				fieldOrder: TenantOrderBy.NAME,
				page: 1,
				pageSize: 999,
				skip: 0,
				limit: 999,
				orderBy: OrderDirection.ASC,
			},
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.WORKSPACE.READ)
	@Get(':id')
	async findOne(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.findOne(id, req.user!.tenantId);
		return new ResponseSuccess({ data: result });
	}

	@TenantWhiteLabelOnly()
	@RequirePermissions(Permission.WORKSPACE.CREATE)
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

	@RequirePermissions(
		Permission.WORKSPACE.UPDATE_INFO,
		Permission.WORKSPACE.UPDATE_STATUS,
		Permission.WORKSPACE.UPDATE_OWNER,
		Permission.WORKSPACE.UPDATE_CONFIG,
	)
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() { ownerId: rawOwnerId, ...payload }: UpdateTenantDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Tenant>> {
		const userType = req.user!.type;
		const userReqId = req.user!.sub;
		const isSysAdmin = checkIsSystemAdmin(userType);
		let ownerId = rawOwnerId;

		// Field-level permission: strip fields user cannot change (system admins bypass)
		if (!isSysAdmin) {
			const userPerms = new Set<string>(
				Array.isArray(req.user!.permission) ? req.user!.permission : [],
			);

			if (!userPerms.has(Permission.WORKSPACE.UPDATE_INFO)) {
				delete payload.name;
				delete payload.code;
				delete payload.title;
				delete payload.domain;
				delete payload.email;
				delete payload.logo;
				delete payload.icon;
				delete payload.primaryColor;
			}

			if (!userPerms.has(Permission.WORKSPACE.UPDATE_STATUS)) {
				delete payload.isActive;
			}

			if (!userPerms.has(Permission.WORKSPACE.UPDATE_OWNER)) {
				ownerId = undefined;
			}

			if (!userPerms.has(Permission.WORKSPACE.UPDATE_CONFIG)) {
				delete payload.maxLabels;
				delete payload.tenantTierId;
			}
		}

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
		if (ownerId && (isOwnerParentTenant || isSysAdmin)) {
			await this.tenantUserService.updateOwner(
				result.id,
				ownerId,
				userReqId,
			);
		}

		return new ResponseSuccess({ data: result });
	}
}
