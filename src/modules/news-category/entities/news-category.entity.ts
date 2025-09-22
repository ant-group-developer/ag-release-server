import {
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity('news_categories')
export class NewsCategory extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	nameVi: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	nameEn: string;

	@Column({
		type: 'varchar',
		nullable: true,
		length: DEFAULT_LENGTH_NOTE,
	})
	descriptionVi: string | null;

	@Column({
		type: 'varchar',
		nullable: true,
		length: DEFAULT_LENGTH_NOTE,
	})
	descriptionEn: string | null;

	@Column({ type: 'int', default: 0 })
	order: number;
}
