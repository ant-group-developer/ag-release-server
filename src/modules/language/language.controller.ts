import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from './dto/language.dto';
import { Language } from './entities/language.entity';
import { LanguageService } from './language.service';

@Controller('language')
export class LanguageController {
	constructor(private readonly languageService: LanguageService) {}

	@Post()
	async create(
		@Body() createLanguageDto: CreateLanguageDto,
	): Promise<ResponseSuccess<Language>> {
		const result = await this.languageService.create(createLanguageDto);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Language>> {
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

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateLanguageDto: UpdateLanguageDto,
	): Promise<Language> {
		return await this.languageService.update(id, updateLanguageDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.languageService.remove(id);
	}
}
