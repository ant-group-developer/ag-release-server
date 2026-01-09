import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { NewsPost } from './news-post.entity';

@Entity('news_posts_translation', {
	comment: 'Bảng lưu nội dung dịch đa ngôn ngữ cho bài viết tin tức',
})
@Unique(['newsPostId', 'languageCode'])
export class NewsPostTranslation extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID bài viết tin tức gốc',
	})
	newsPostId: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		comment: 'Mã ngôn ngữ của bản dịch',
	})
	languageCode: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tiêu đề bài viết theo ngôn ngữ',
	})
	title: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Mô tả ngắn bài viết theo ngôn ngữ',
	})
	description: string;

	@Column({
		type: 'text',
		comment: 'Nội dung đầy đủ của bài viết theo ngôn ngữ',
	})
	content: string;

	@Column({
		default: false,
		comment: 'Đánh dấu bản dịch mặc định của bài viết',
	})
	isDefault: boolean;

	@ManyToOne(() => NewsPost, (newsPost) => newsPost.newsPostTranslations, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'news_post_id' })
	newsPost: NewsPost;

	languageName?: string | null;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'language_code', referencedColumnName: 'code' })
	language?: Language;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator?: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier?: User;
}
