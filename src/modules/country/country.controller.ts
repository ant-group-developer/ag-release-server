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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CountryMessageCodeSuccess,
	CountryMessageError,
	CountryMessageSuccess,
} from './constants/country.constant';
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
	@ApiOperation({ summary: 'Create a new country' })
	@ApiResponse({
		status: 200,
		description: CountryMessageSuccess.CREATE,
	})
	@ApiResponse({
		status: 409,
		description: CountryMessageError.DUPLICATE_NAME_COUNTRY,
	})
	async create(
		@Body() createCountryDto: CreateCountryDto,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.create(createCountryDto);
		return new ResponseSuccess({
			data: result,
			messageCode: CountryMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a country by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved country',
	})
	@ApiResponse({ status: 404, description: CountryMessageError.NOT_FOUND })
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of countries' })
	@ApiResponse({
		status: 200,
		description: 'List of countries',
	})
	async getList(
		@Query() query: QueryGetListCountryDto,
	): Promise<ResponseSuccess<PageDto<Country>>> {
		const result = await this.countryService.getList(query);
		return new ResponseSuccess({
			data: result,
		});
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a country by ID' })
	@ApiResponse({
		status: 200,
		description: CountryMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 409,
		description: CountryMessageError.DUPLICATE_NAME_COUNTRY,
	})
	async update(
		@Param('id') id: string,
		@Body() updateCountryDto: UpdateCountryDto,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.update(id, updateCountryDto);
		return new ResponseSuccess({
			messageCode: CountryMessageCodeSuccess.UPDATE,
			data: result,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a country by ID' })
	@ApiResponse({ status: 200, description: CountryMessageSuccess.DELETE })
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.countryService.remove(id);
		return new ResponseSuccess({
			messageCode: CountryMessageCodeSuccess.DELETE,
		});
	}
}
