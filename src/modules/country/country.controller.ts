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
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { CountryMessageCodeSuccess } from './constants/country.constant';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	SyncCountryFlagsDto,
	UpdateCountryDto,
} from './dto/country.dto';
import { Country } from './entities/country.entity';
import { CountryService } from './services/country.service';

@ApiTags('Countries')
@Controller('countries')
export class CountryController {
	constructor(private readonly countryService: CountryService) {}

	@SystemAdminOnly()
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

	@Get()
	async getList(
		@Query() query: QueryGetListCountryDto,
	): Promise<ResponseSuccess<PageDto<Country>>> {
		const result = await this.countryService.getList(query);
		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('continents')
	async getListContinent() {
		const result = await this.countryService.getListContinent();
		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.countryService.getListSimple();
		return new ResponseSuccess({
			data: result,
		});
	}

	@SystemAdminOnly()
	@Post('flags/sync')
	async syncFlags(@Query() query: SyncCountryFlagsDto) {
		const result = await this.countryService.syncFlags(query.force ?? false);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<Country>> {
		const result = await this.countryService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
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

	@SystemAdminOnly()
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
