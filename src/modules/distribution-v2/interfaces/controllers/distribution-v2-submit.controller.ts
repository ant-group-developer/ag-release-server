import {
	Body,
	ConflictException,
	Controller,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common';
import {
	ApiBody,
	ApiHeader,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { RequirePermissions } from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { UserType } from 'src/modules/user/enum/user.enum';
import { DistributionV2SubmitService } from '../../application/distribution-v2-submit.service';
import {
	DistributionV2ReviewRejectDto,
	DistributionV2SubmitDto,
} from '../dto/distribution-v2-submit.dto';

@ApiTags('Distribution V2')
@Controller('distribution-v2')
export class DistributionV2SubmitController {
	constructor(private readonly service: DistributionV2SubmitService) {}

	@Post('releases/:releaseId/submit')
	@HttpCode(HttpStatus.ACCEPTED)
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@ApiOperation({ summary: 'Submit release to distribution-v2' })
	@ApiHeader({ name: 'Idempotency-Key', required: true })
	@ApiBody({ type: DistributionV2SubmitDto })
	@ApiResponse({ status: HttpStatus.ACCEPTED })
	async submit(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() body: DistributionV2SubmitDto,
		@Headers('idempotency-key') idempotencyKey: string,
		@Req() req: Request,
	) {
		const result = await this.service.submit(
			releaseId,
			body,
			this.actor(req),
			this.requireKey(idempotencyKey),
		);
		return new ResponseSuccess({
			statusCode: HttpStatus.ACCEPTED,
			messageCode: 'common.processing',
			data: result,
		});
	}

	@Post('releases/:releaseId/update')
	@HttpCode(HttpStatus.ACCEPTED)
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@ApiOperation({ summary: 'Create an update distribution-v2' })
	@ApiHeader({ name: 'Idempotency-Key', required: true })
	@ApiBody({ type: DistributionV2SubmitDto })
	async update(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() body: DistributionV2SubmitDto,
		@Headers('idempotency-key') idempotencyKey: string,
		@Req() req: Request,
	) {
		const result = await this.service.update(
			releaseId,
			body,
			this.actor(req),
			this.requireKey(idempotencyKey),
		);
		return new ResponseSuccess({
			statusCode: HttpStatus.ACCEPTED,
			messageCode: 'common.processing',
			data: result,
		});
	}

	@Post('releases/:releaseId/takedown')
	@HttpCode(HttpStatus.ACCEPTED)
	@RequirePermissions(
		Permission.RELEASE_AUDIO.TAKE_DOWN,
		Permission.RELEASE_VIDEO.TAKE_DOWN,
	)
	@ApiOperation({ summary: 'Create a takedown distribution-v2' })
	@ApiHeader({ name: 'Idempotency-Key', required: true })
	@ApiBody({ type: DistributionV2SubmitDto })
	async takedown(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() body: DistributionV2SubmitDto,
		@Headers('idempotency-key') idempotencyKey: string,
		@Req() req: Request,
	) {
		const result = await this.service.takedown(
			releaseId,
			body,
			this.actor(req),
			this.requireKey(idempotencyKey),
		);
		return new ResponseSuccess({
			statusCode: HttpStatus.ACCEPTED,
			messageCode: 'common.processing',
			data: result,
		});
	}

	@Post('distributions/:distributionId/review/approve')
	@HttpCode(HttpStatus.ACCEPTED)
	@RequirePermissions(Permission.RELEASE_REVIEW.APPROVE)
	@ApiOperation({ summary: 'Approve a distribution-v2 review' })
	@ApiHeader({ name: 'Idempotency-Key', required: true })
	async approveReview(
		@Param('distributionId', ParseUUIDPipe) distributionId: string,
		@Headers('idempotency-key') idempotencyKey: string,
		@Req() req: Request,
	) {
		const result = await this.service.approveReview(
			distributionId,
			this.actor(req),
			this.requireKey(idempotencyKey),
		);
		return new ResponseSuccess({
			statusCode: HttpStatus.ACCEPTED,
			messageCode: 'common.processing',
			data: result,
		});
	}

	@Post('distributions/:distributionId/review/reject')
	@HttpCode(HttpStatus.ACCEPTED)
	@RequirePermissions(Permission.RELEASE_REVIEW.REJECT)
	@ApiOperation({ summary: 'Reject a distribution-v2 review' })
	@ApiHeader({ name: 'Idempotency-Key', required: true })
	@ApiBody({ type: DistributionV2ReviewRejectDto })
	async rejectReview(
		@Param('distributionId', ParseUUIDPipe) distributionId: string,
		@Body() body: DistributionV2ReviewRejectDto,
		@Headers('idempotency-key') idempotencyKey: string,
		@Req() req: Request,
	) {
		const result = await this.service.rejectReview(
			distributionId,
			this.actor(req),
			this.requireKey(idempotencyKey),
			body.note,
		);
		return new ResponseSuccess({
			statusCode: HttpStatus.ACCEPTED,
			messageCode: 'common.processing',
			data: result,
		});
	}

	private actor(req: Request) {
		const user = req.user;
		if (!user) throw new ConflictException('Thiếu thông tin người dùng');
		return {
			userId: user.sub,
			tenantId: user.tenantId,
			isSystemAdmin: user.type === UserType.ADMIN,
		};
	}

	private requireKey(value?: string): string {
		if (!value?.trim()) {
			throw new ConflictException('Thiếu header Idempotency-Key');
		}
		return value;
	}
}
