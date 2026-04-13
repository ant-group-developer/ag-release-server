import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { NewsCategory } from 'src/modules/news-category/entities/news-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MediaUrlTransformer } from 'src/utils/util';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { NewsPostStatus } from '../enum/news-post.enum';
import { NewsPostTranslation } from './news-post-translation.entity';

@Entity('news_posts', {
	comment: 'Bài viết tin tức, hỗ trợ đa ngôn ngữ thông qua bảng translation',
})
export class NewsPost extends BaseUserTrackedUUIDEntity {
	title?: string | null;
	description?: string | null;
	content?: string | null;
	languageCode?: string | null;
	languageName?: string | null;

	@Column({
		type: 'varchar',
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Ảnh thumbnail của bài viết',
		transformer: MediaUrlTransformer,
	})
	thumbnail: string | null;

	@Column({
		type: 'enum',
		enum: NewsPostStatus,
		default: NewsPostStatus.PRIVATE,
		comment: 'Trạng thái bài viết (private / public / draft...)',
	})
	status: NewsPostStatus;

	@Column({
		type: 'uuid',
		comment: 'ID danh mục tin tức',
	})
	newsCategoryId: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Slug dùng cho URL bài viết',
	})
	slug: string;

	@Column({
		type: 'text',
		array: true,
		default: '{}',
		comment: 'Danh sách từ khóa SEO của bài viết',
	})
	keywords: string[];

	@ManyToOne(() => NewsCategory, (category) => category.id)
	@JoinColumn({ name: 'news_category_id' })
	newsCategory: NewsCategory;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@OneToMany(
		() => NewsPostTranslation,
		(newsPostTranslation) => newsPostTranslation.newsPost,
	)
	newsPostTranslations?: NewsPostTranslation[];
}
