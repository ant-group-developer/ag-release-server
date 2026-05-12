import { EntityCache } from '../enum/cache.enum';

export class SetCacheDto {
	entity: EntityCache;
	key: string;
	value: any;
	ttl?: number;
}
