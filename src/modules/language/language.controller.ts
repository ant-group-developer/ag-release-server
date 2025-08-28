import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { LanguageMessageCodeSuccess } from './constants/language.constant';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from './dto/language.dto';
import { Language } from './entities/language.entity';
import { LanguageService } from './services/language.service';

@ApiTags('Languages')
@Controller('languages')
export class LanguageController {
	constructor(private readonly languageService: LanguageService) {}

	@SystemAdminOnly()
	@Post()
	@ApiOperation({ summary: 'Create a new language' })
	async create(
		@Body() createLanguageDto: CreateLanguageDto,
	): Promise<ResponseSuccess<Language>> {
		const result = await this.languageService.create(createLanguageDto);
		return new ResponseSuccess({
			data: result,
			messageCode: LanguageMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<Language>> {
		const result = await this.languageService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListLanguageDto,
	): Promise<ResponseSuccess<PageDto<Language>>> {
		const result = await this.languageService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateLanguageDto: UpdateLanguageDto,
	): Promise<ResponseSuccess<Language>> {
		const result = await this.languageService.update(id, updateLanguageDto);
		return new ResponseSuccess({
			data: result,
			messageCode: LanguageMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.languageService.delete(id);
		return new ResponseSuccess({
			messageCode: LanguageMessageCodeSuccess.DELETE,
		});
	}
}
