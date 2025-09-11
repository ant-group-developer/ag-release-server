export interface SetCacheDto {
	key: string;
	value: any;
	ttl?: number;
}

export interface UpdateCacheDto {
	value: any;
	ttl?: number;
}
