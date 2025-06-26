import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
import { CountryService } from './country.service';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from './dto/country.dto';
import { Country } from './entities/country.entity';

@Controller('country')
export class CountryController {
	constructor(private readonly countryService: CountryService) {}

	@Post()
	async create(
		@Body() createCountryDto: CreateCountryDto,
	): Promise<ResponseSuccessDto<Country>> {
		const result = await this.countryService.create(createCountryDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<Country>> {
		const result = await this.countryService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListCountryDto,
	): Promise<ResponseSuccessDto<PageDto<Country>>> {
		const result = await this.countryService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Patch(':id')
	async update(
		@Param('id') id: string,
		@Body() updateCountryDto: UpdateCountryDto,
	): Promise<Country> {
		return await this.countryService.update(id, updateCountryDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.countryService.remove(id);
	}
}
