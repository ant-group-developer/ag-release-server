import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { State51EmailService } from './services/state51-email.service';
import {
	BatchSendEmailDto,
	CreateState51EmailDto,
	QueryGetListState51EmailDto,
	UpdateState51EmailDto,
} from './dto/state51-email.dto';

@ApiTags('State51 Emails')
@Controller('state51-emails')
export class State51EmailController {
	constructor(private readonly state51EmailService: State51EmailService) {}

	/** Lấy danh sách (phân trang + lọc) */
	@Get()
	async getList(@Query() query: QueryGetListState51EmailDto) {
		const result = await this.state51EmailService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết */
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.state51EmailService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	/** Thêm thủ công vào hàng chờ */
	@Post()
	async create(@Body() body: CreateState51EmailDto) {
		const result = await this.state51EmailService.enqueue(body);
		return new ResponseSuccess({ data: result });
	}

	/** Cập nhật thông tin record */
	@Patch(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: UpdateState51EmailDto,
	) {
		const result = await this.state51EmailService.update(id, body);
		return new ResponseSuccess({ data: result });
	}

	/** Xóa record */
	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.state51EmailService.delete(id);
		return new ResponseSuccess({ data: result });
	}

	// ==========================================
	// Batch Actions
	// ==========================================

	/** Gửi lẻ 1 email */
	@Post(':id/send')
	async sendOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.state51EmailService.sendOne(id);
		return new ResponseSuccess({ data: result });
	}

	/** Gửi nhiều theo mảng IDs */
	@Post('send-batch')
	async sendMany(@Body() body: BatchSendEmailDto) {
		const result = await this.state51EmailService.sendMany(body.ids);
		return new ResponseSuccess({ data: result });
	}

	/** Gửi toàn bộ đang chờ (isSent = false) */
	@Post('send-all-pending')
	async sendAllPending() {
		const result = await this.state51EmailService.sendAllPending();
		return new ResponseSuccess({ data: result });
	}

	/** Gửi toàn bộ releases mới trong ngày */
	@Post('send-all-today')
	async sendAllToday() {
		const result = await this.state51EmailService.sendAllToday();
		return new ResponseSuccess({ data: result });
	}
}
