import { BaseEntity } from 'src/database/dto/database.dto';
import { Entity } from 'typeorm';

@Entity('config')
export class ConfigEntity extends BaseEntity {}
