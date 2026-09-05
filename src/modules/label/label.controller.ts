import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { AuthMessages } from '../auth/constants/messages';
import {
	RequirePermissions,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { Permission } from '../permission/constants/permission.data.constant';
import {
	checkIsNotSystemTenant,
	checkIsSystemTenant,
} from '../user/utils/user-type.util';
import {
	LabelMessage,
	LabelMessageCodeSuccess,
	LabelMessageSuccess,
} from './constants/label.constant';
import {
	CreateLabelDto,
	QueryGetListLabelDto,
	UpdateLabelDto,
} from './dto/label.dto';
import { Label } from './entities/label.entity';
import { LabelService } from './services/label.service';

@ApiTags('Labels')
@Controller('labels')
export class LabelController {
	constructor(private readonly labelService: LabelService) {}

	@RequirePermissions(Permission.LABEL.CREATE)
	@Post()
	async create(
		@Body() createLabelDto: CreateLabelDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Label>> {
		const tenantId = req.user!.tenantId;

		const userId = req.user!.sub;
		if (checkIsSystemTenant(tenantId)) {
			throw new ResponseError(LabelMessage.SYSTEM_TENANT_FORBIDDEN);
		}

		await this.labelService.checkExceedLabels(tenantId);

		const result = await this.labelService.create(
			createLabelDto,
			tenantId,
			userId,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: LabelMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of labels' })
	@ApiResponse({
		status: 200,
		description: 'List of labels',
	})
	async getList(
		@Query() query: QueryGetListLabelDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Label>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.labelService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	@ApiOperation({ summary: 'Get a list of labels' })
	@ApiResponse({
		status: 200,
		description: 'List of labels',
	})
	async getListSimple(
		@Query() query: QueryGetListLabelDto,
		@Req() req: Request,
	) {
		const actorTenantId = req.user!.tenantId;

		const tenantIds = checkIsNotSystemTenant(actorTenantId)
			? [actorTenantId]
			: query.tenantIds;

		const result = await this.labelService.getListSimple(tenantIds);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<Label>> {
		const result = await this.labelService.findOneWithCountRelation(id);

		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId) && tenantId !== result.tenantId) {
			throw new ResponseError(AuthMessages.FORBIDDEN);
		}

		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.LABEL.UPDATE)
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateLabelDto: UpdateLabelDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Label>> {
		const userId = req.user!.sub;

		const result = await this.labelService.update(
			id,
			updateLabelDto,
			userId,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: LabelMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	@ApiOperation({ summary: 'Delete a label by ID' })
	@ApiResponse({
		status: 200,
		description: LabelMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.labelService.delete(id);
		return new ResponseSuccess({
			messageCode: LabelMessageCodeSuccess.DELETE,
		});
	}
}
