import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigEntity } from './entities/config.entity';

@Injectable()
export class ConfigDBService {
	constructor(
		@InjectRepository(ConfigEntity)
		private readonly configRepository: Repository<ConfigEntity>,
	) {}
}
