import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBody,
	ApiHeader,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PublicRoute } from '../../auth/decorators/auth.decorator';
import {
	CreateVevoChannelDto,
	VevoChannelCallbackDto,
} from '../../channel/dto/vevo.dto';
import { VevoVideoNotificationDto } from '../dto/vevo-video-notification.dto';
import { VevoCallbackApiKeyGuard } from '../guards/vevo-callback-api-key.guard';
import { WebhookService } from '../webhook.service';

@ApiTags('Vevo')
@Controller('vevo')
export class VevoWebhookController {
	constructor(private readonly webhookService: WebhookService) {}

	@Post('new-channel')
	@ApiOperation({ summary: 'Test creating a Vevo channel request' })
	@ApiBody({ type: CreateVevoChannelDto })
	async newChannel(@Body() payload: CreateVevoChannelDto) {
		const result = await this.webhookService.createVevoChannel(
			payload.channelName,
		);
		return new ResponseSuccess({ data: result });
	}

	@PublicRoute()
	@UseGuards(VevoCallbackApiKeyGuard)
	@Post('callback')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive a completed Vevo channel request' })
	@ApiHeader({
		name: 'x-api-key',
		required: true,
		description: 'Static Vevo callback API key',
	})
	@ApiBody({ type: VevoChannelCallbackDto })
	@ApiResponse({ status: 200, description: 'Callback received' })
	async handleVevoCallback(@Body() payload: VevoChannelCallbackDto) {
		const result = await this.webhookService.handleVevoCallback(payload);
		return new ResponseSuccess({ data: result });
	}

	@PublicRoute()
	@UseGuards(VevoCallbackApiKeyGuard)
	@Post('callback/video')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive a Vevo video notification callback' })
	@ApiHeader({
		name: 'x-api-key',
		required: true,
		description: 'Static Vevo callback API key',
	})
	@ApiBody({ type: VevoVideoNotificationDto })
	@ApiResponse({ status: 200, description: 'Video callback received' })
	async handleVideoNotification(@Body() payload: VevoVideoNotificationDto) {
		const result =
			await this.webhookService.handleVevoVideoNotification(payload);
		return new ResponseSuccess({ data: result });
	}
}
