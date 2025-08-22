import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { AppConfigShape } from '../interfaces/app-config.type';

@Entity({ name: 'app_config' })
export class AppConfig extends BaseUUIDEntity {
	@Column({ type: 'jsonb' })
	config: AppConfigShape;
}
