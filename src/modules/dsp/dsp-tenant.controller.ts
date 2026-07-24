import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { Repository } from 'typeorm';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { PartialTestConnectionDto } from '../distribution/sftp-configs/type/sftp-config.type';
import { Release } from '../release/entities/release.entity';
import { checkIsSystemTenant } from '../user/utils/user-type.util';
import { AdminToggleDspDto, UpdateTenantDspAgreementDto } from './dto/dsp.dto';
import { TenantDspAgreementService } from './services/dsp-tenant.service';

@ApiTags('Tenant DSP Agreement')
@Controller('tenant-dsp-agreements')
export class TenantDspAgreementController {
	constructor(
		private readonly tenantDspAgreementService: TenantDspAgreementService,
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	// @SystemAdminOnly()
	@Get('admin/tenants/:tenantId/dsps')
	@ApiOperation({
		summary: 'ADMIN: Lấy danh sách DSP và trạng thái agreement của tenant',
	})
	@ApiParam({ name: 'tenantId', type: String })
	async adminGetDspsForTenant(@Param('tenantId') tenantId: string) {
		return new ResponseSuccess({
			data: await this.tenantDspAgreementService.adminGetDspsForTenant(
				tenantId,
			),
		});
	}

	@SystemAdminOnly()
	@Patch('admin/tenants/:tenantId/dsps')
	@ApiOperation({
		summary: 'ADMIN: Bật/tắt quyền DSP cho tenant',
	})
	@ApiParam({
		name: 'tenantId',
		type: String,
	})
	@ApiBody({
		type: AdminToggleDspDto,
	})
	async adminToggleDsp(
		@Param('tenantId') tenantId: string,
		@Body() dto: AdminToggleDspDto,
	) {
		await this.tenantDspAgreementService.adminToggleDsp(
			tenantId,
			dto.items,
		);

		return new ResponseSuccess({});
	}

	@Get('tenant/dsps')
	@ApiOperation({
		summary: 'TENANT: Lấy danh sách DSP đã được cấp quyền',
		description:
			'System admin truyền releaseId để lấy DSP theo tenant của release.',
	})
	async tenantGetDsps(
		@User() user: UserReq,
		@Query('releaseId') releaseId?: string,
	) {
		let tenantId = user.tenantId;

		// System admin: resolve tenant từ release thay vì dùng system-tenant
		if (checkIsSystemTenant(tenantId) && releaseId) {
			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
				select: ['tenantId'],
			});
			if (release?.tenantId) {
				tenantId = release.tenantId;
			}
		}

		return new ResponseSuccess({
			data: await this.tenantDspAgreementService.tenantGetDsps(tenantId),
		});
	}

	@Post('tenant/:tenantId/dsps/:dspId/test-sftp')
	@ApiOperation({ summary: 'Test SFTP connection cho tenant DSP agreement' })
	async testConnectByAgreement(
		@User() user: UserReq,
		@Param('dspId') dspId: string,
		@Body() data: PartialTestConnectionDto,
	) {
		const result =
			await this.tenantDspAgreementService.testConnectByAgreement({
				tenantId: user.tenantId,
				dspId,
				data,
			});
		return new ResponseSuccess({ data: result });
	}

	@Patch('tenant/dsps/:dspId')
	@ApiOperation({ summary: 'Tenant update routing config DSP' })
	async updateAgreement(
		@Param('dspId') dspId: string,
		@Body() dto: UpdateTenantDspAgreementDto,
		@User() user: UserReq,
	) {
		await this.tenantDspAgreementService.updateAgreement(
			user.tenantId,
			// 'be3ac579-c5d5-43ca-af1a-8b14f78139c1',
			dspId,
			dto,
		);
		return new ResponseSuccess({});
	}

	@Get('test/tenant/dsps/:tenantId')
	@ApiOperation({
		summary: 'TEST: Lấy danh sách DSP theo tenantId',
	})
	@ApiParam({
		name: 'tenantId',
		type: String,
		example: 'uuid-tenant-id',
	})
	async testTenantGetDsps(@Param('tenantId') tenantId: string) {
		return new ResponseSuccess({
			data: await this.tenantDspAgreementService.tenantGetDsps(tenantId),
		});
	}
}
