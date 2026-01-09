import {
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity('news_categories', {
	comment: 'Danh mục tin tức dùng cho hệ thống bài viết / news',
})
export class NewsCategory extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên danh mục tin tức (tiếng Việt)',
	})
	nameVi: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên danh mục tin tức (tiếng Anh)',
	})
	nameEn: string;

	@Column({
		type: 'varchar',
		nullable: true,
		length: DEFAULT_LENGTH_NOTE,
		comment: 'Mô tả danh mục tin tức (tiếng Việt)',
	})
	descriptionVi: string | null;

	@Column({
		type: 'varchar',
		nullable: true,
		length: DEFAULT_LENGTH_NOTE,
		comment: 'Mô tả danh mục tin tức (tiếng Anh)',
	})
	descriptionEn: string | null;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Thứ tự hiển thị của danh mục',
	})
	order: number;
}
