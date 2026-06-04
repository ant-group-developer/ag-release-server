import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import { VevoChannelCallbackDto } from '../dtos/vevo.dto';
import { VevoService } from '../services/vevo.service';

@ApiTags('Partners API - Vevo')
@Controller('partners/vevo/channels')
export class VevoController {
	constructor(private readonly vevoService: VevoService) {}

	@PublicRoute()
	@Post('callback')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive a completed Vevo channel request' })
	@ApiBody({ type: VevoChannelCallbackDto })
	@ApiResponse({ status: 200, description: 'Callback received' })
	handleChannelCreated(@Body() payload: VevoChannelCallbackDto) {
		return this.vevoService.handleChannelCreated(payload);
	}
}
