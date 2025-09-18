import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { CacheService } from './cache.service';
import { SetCacheDto } from './dto/cache.dto';
import { EntityCache } from './enum/cache.enum';

@Controller('cache')
export class CacheController {
	constructor(private readonly cacheService: CacheService) {}

	@Post()
	async setCache(@Body() setCacheDto: SetCacheDto) {
		const { entity, key, value, ttl } = setCacheDto;
		await this.cacheService.set({ entity, key, value, ttl });
		return new ResponseSuccess();
	}

	@Get(':entity/:key')
	async getCache(
		@Param('entity') entity: EntityCache,
		@Param('key') key: string,
	) {
		const data = await this.cacheService.get<any>({ entity, key });
		return new ResponseSuccess({ data });
	}

	@Delete(':entity/:key')
	async deleteCache(
		@Param('entity') entity: EntityCache,
		@Param('key') key: string,
	) {
		await this.cacheService.del({ entity, key });
		return new ResponseSuccess();
	}
}
