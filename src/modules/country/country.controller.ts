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
import { COUNTRY_SUCCESS } from './constants/country.constants';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from './dto/country.dto';
import { Country } from './entities/country.entity';
import { CountryService } from './services/country.service';

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
			messageCode: COUNTRY_SUCCESS.create,
		});
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Country>> {
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
		@Param('id') id: string,
		@Body() updateCountryDto: UpdateCountryDto,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.update(id, updateCountryDto);
		return new ResponseSuccess({
			messageCode: COUNTRY_SUCCESS.update,
			data: result,
		});
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.countryService.remove(id);
		return new ResponseSuccess({ messageCode: COUNTRY_SUCCESS.delete });
	}
}
