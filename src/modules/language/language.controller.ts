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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
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
	): Promise<ResponseSuccessDto<Language>> {
		const result = await this.languageService.create(createLanguageDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<Language>> {
		const result = await this.languageService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListLanguageDto,
	): Promise<ResponseSuccessDto<PageDto<Language>>> {
		const result = await this.languageService.getList(query);
		return new ResponseSuccessDto({ data: result });
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
