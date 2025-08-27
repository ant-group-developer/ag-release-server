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
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { CountryMessageCodeSuccess } from './constants/country.constant';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from './dto/country.dto';
import { Country } from './entities/country.entity';
import { CountryService } from './services/country.service';

@ApiTags('Countries')
@Controller('countries')
export class CountryController {
	constructor(private readonly countryService: CountryService) {}

	@Post()
	async create(
		@Body() createCountryDto: CreateCountryDto,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.create(createCountryDto);
		return new ResponseSuccess({
			data: result,
			messageCode: CountryMessageCodeSuccess.CREATE,
		});
	}

	@Get('continents')
	async getListContinent() {
		const result = await this.countryService.getListContinent();
		return new ResponseSuccess({
			data: result,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListCountryDto,
	): Promise<ResponseSuccess<PageDto<Country>>> {
		const result = await this.countryService.getList(query);
		return new ResponseSuccess({
			data: result,
		});
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateCountryDto: UpdateCountryDto,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.update(id, updateCountryDto);
		return new ResponseSuccess({
			messageCode: CountryMessageCodeSuccess.UPDATE,
			data: result,
		});
	}

	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.countryService.delete(id);
		return new ResponseSuccess({
			messageCode: CountryMessageCodeSuccess.DELETE,
		});
	}
}
