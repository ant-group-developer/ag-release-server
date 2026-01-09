import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { AppConfigShape } from '../interfaces/app-config.type';

@Entity('app_config', {
	comment: 'Cấu hình ứng dụng, lưu trữ dưới dạng JSON có cấu trúc',
})
export class AppConfig extends BaseUUIDEntity {
	@Column({
		type: 'jsonb',
		comment: 'Dữ liệu cấu hình tổng thể của hệ thống',
	})
	config: AppConfigShape;
}
