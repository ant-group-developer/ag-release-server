import {
	Body,
	Controller,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Param,
	Post,
	Put,
} from '@nestjs/common';
import { CacheService } from './cache.service';
import { SetCacheDto, UpdateCacheDto } from './dto/cache.dto';

@Controller('cache')
export class CacheController {
	constructor(private readonly cacheService: CacheService) {}

	@Post()
	async setCache(@Body() setCacheDto: SetCacheDto) {
		const { key, value, ttl } = setCacheDto;
		await this.cacheService.set(key, value, ttl);
		return {
			message: `Successfully set key ${key} in cache`,
			key,
			value,
			ttl,
		};
	}

	@Get(':key')
	async getCache(@Param('key') key: string) {
		const value = await this.cacheService.get<string>(key);
		if (!value) {
			throw new HttpException(
				`Key ${key} not found in cache`,
				HttpStatus.NOT_FOUND,
			);
		}
		return { key, value };
	}

	@Put(':key')
	async updateCache(
		@Param('key') key: string,
		@Body() updateCacheDto: UpdateCacheDto,
	) {
		const { value, ttl } = updateCacheDto;
		const existingValue = await this.cacheService.get<string>(key);
		if (!existingValue) {
			throw new HttpException(
				`Key ${key} not found in cache`,
				HttpStatus.NOT_FOUND,
			);
		}
		await this.cacheService.set(key, value, ttl);
		return {
			message: `Successfully updated key ${key} in cache`,
			key,
			value,
			ttl,
		};
	}

	@Delete(':key')
	async deleteCache(@Param('key') key: string) {
		const existingValue = await this.cacheService.get<string>(key);
		if (!existingValue) {
			throw new HttpException(
				`Key ${key} not found in cache`,
				HttpStatus.NOT_FOUND,
			);
		}
		// await this.cacheService.delete(key);
		return { message: `Successfully deleted key ${key} from cache` };
	}
}
