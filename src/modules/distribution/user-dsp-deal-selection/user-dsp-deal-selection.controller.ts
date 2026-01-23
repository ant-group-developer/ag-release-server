import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { UserDspDealSelectionSuccess } from './const/user-dsp-deal-selection.const';
import {
	CreateUserDspDealSelectionDto,
	GetListUserDspDealSelectionDto,
	UpdateUserDspDealSelectionDto,
} from './dto/user-dsp-deal-selection.dto';
import { UserDspDealSelectionEntity } from './entities/user-dsp-deal-selection.entity';
import { UserDspDealSelectionService } from './services/user-dsp-deal-selection.service';

@ApiTags('User DSP Deal Selection')
@SystemAdminOnly()
@Controller('distribution/user-dsp-deal-selections')
export class UserDspDealSelectionController {
	constructor(private readonly svc: UserDspDealSelectionService) {}

	@Post()
	@ApiOperation({ summary: 'Create user DSP deal selection' })
	@ApiResponse({ status: 201, type: UserDspDealSelectionEntity })
	async create(@Body() data: CreateUserDspDealSelectionDto) {
		const result = await this.svc.create({ data });
		return UserDspDealSelectionSuccess.CREATE(result);
	}

	// Composite key: (userId, dspId)
	@Get(':userId/:dspId')
	@ApiOperation({ summary: 'Get selection by user + dsp' })
	@ApiParam({ name: 'userId', type: Number })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiResponse({ status: 200, type: UserDspDealSelectionEntity })
	async findOne(
		@Param('userId', ParseIntPipe) userId: number,
		@Param('dspId', ParseIntPipe) dspId: number,
	) {
		const result = await this.svc.findOne({
			userId: String(userId),
			dspId: String(dspId),
		});
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get list selections' })
	@ApiQuery({ type: GetListUserDspDealSelectionDto })
	@ApiResponse({ status: 200, type: [UserDspDealSelectionEntity] })
	async getList(@Query() query: GetListUserDspDealSelectionDto) {
		const result = await this.svc.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':userId/:dspId')
	@ApiOperation({ summary: 'Update selection by user + dsp' })
	@ApiParam({ name: 'userId', type: Number })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiResponse({ status: 200, type: UserDspDealSelectionEntity })
	async update(
		@Param('userId', ParseIntPipe) userId: number,
		@Param('dspId', ParseIntPipe) dspId: number,
		@Body() data: UpdateUserDspDealSelectionDto,
	) {
		const result = await this.svc.update({
			key: { userId: String(userId), dspId: String(dspId) },
			data,
		});
		return UserDspDealSelectionSuccess.UPDATE(result);
	}

	@Delete(':userId/:dspId')
	@ApiOperation({ summary: 'Delete selection by user + dsp' })
	@ApiParam({ name: 'userId', type: Number })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiResponse({ status: 200 })
	async delete(
		@Param('userId', ParseIntPipe) userId: number,
		@Param('dspId', ParseIntPipe) dspId: number,
	) {
		await this.svc.delete({ userId: String(userId), dspId: String(dspId) });
		return UserDspDealSelectionSuccess.DELETE();
	}
}
