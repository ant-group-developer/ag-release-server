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
import { CreateVevoChannelDto, VevoChannelCallbackDto } from '../dto/vevo.dto';
import { VevoCallbackApiKeyGuard } from '../guards/vevo-callback-api-key.guard';
import { ChannelService } from '../services/channel.service';
import { VevoService } from '../services/vevo.service';

@ApiTags('Vevo')
@Controller('vevo')
export class VevoController {
	constructor(
		private readonly channelService: ChannelService,
		private readonly vevoService: VevoService,
	) {}

	@Post('new-channel')
	@ApiOperation({ summary: 'Test creating a Vevo channel request' })
	@ApiBody({ type: CreateVevoChannelDto })
	async newChannel(@Body() payload: CreateVevoChannelDto) {
		const result = await this.vevoService.newChannel(payload.channelName);
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
		const result = await this.channelService.handleVevoCallback(payload);
		return new ResponseSuccess({ data: result });
	}
}
