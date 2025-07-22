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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	LanguageMessageCodeSuccess,
	LanguageMessageError,
	LanguageMessageSuccess,
} from './constants/language.constant';
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
	constructor(private readonly languageService: LanguageService) { }

	@Post()
	@ApiOperation({ summary: 'Create a new language' })
	@ApiResponse({
		status: 200,
		description: LanguageMessageSuccess.CREATE,
	})
	@ApiResponse({
		status: 409,
		description: LanguageMessageError.DUPLICATE_NAME_LANGUAGE,
	})
	@ApiResponse({
		status: 409,
		description: LanguageMessageError.DUPLICATE_CODE_LANGUAGE,
	})
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
	@ApiOperation({ summary: 'Get a language by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved language',
	})
	@ApiResponse({
		status: 404,
		description: LanguageMessageError.NOT_FOUND,
	})
	async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ResponseSuccess<Language>> {
		const result = await this.languageService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of languages' })
	@ApiResponse({
		status: 200,
		description: 'List of languages',
	})
	async getList(
		@Query() query: QueryGetListLanguageDto,
	): Promise<ResponseSuccess<PageDto<Language>>> {
		const result = await this.languageService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a language by ID' })
	@ApiResponse({
		status: 200,
		description: LanguageMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 409,
		description: LanguageMessageError.DUPLICATE_NAME_LANGUAGE,
	})
	@ApiResponse({
		status: 409,
		description: LanguageMessageError.DUPLICATE_CODE_LANGUAGE,
	})
	@ApiResponse({
		status: 404,
		description: LanguageMessageError.NOT_FOUND,
	})
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

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a language by ID' })
	@ApiResponse({
		status: 200,
		description: LanguageMessageSuccess.DELETE,
	})
	async remove(@Param('id', ParseUUIDPipe) id: string): Promise<ResponseSuccess<void>> {
		await this.languageService.delete(id);
		return new ResponseSuccess({
			messageCode: LanguageMessageCodeSuccess.DELETE,
		});
	}
}
