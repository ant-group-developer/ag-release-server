import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateI18nDto } from './i18n.dto';
import { I18nService } from './i18n.service';

@Controller('i18n')
export class I18nController {
	constructor(private readonly service: I18nService) {}

	@Post()
	create(@Body() dto: CreateI18nDto) {
		return this.service.create(dto);
	}

	// @Get()
	// list(@Query() q: ListI18nQueryDto) {
	// 	// nếu service chưa có list thì comment dòng này
	// 	return this.service.list(q);
	// }

	@Get(':locale/:key')
	findOne(@Param('locale') locale: string, @Param('key') key: string) {
		return this.service.findOne({ locale, key });
	}

	// @Put(':locale/:key')
	// update(
	// 	@Param('locale') locale: string,
	// 	@Param('key') key: string,
	// 	@Body() dto: UpdateI18nDto,
	// ) {
	// 	// service nhận value string, không nhận object
	// 	return this.service.update(locale, key, dto.value);
	// }

	@Delete(':locale/:key')
	remove(@Param('locale') locale: string, @Param('key') key: string) {
		return this.service.remove(locale, key);
	}

	// @Post('bulk-upsert')
	// bulkUpsert(@Body() dto: any) {
	// 	return this.service.bulkUpsert(dto);
	// }
}
