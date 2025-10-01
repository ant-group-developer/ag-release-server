import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { NewsPost } from './news-post.entity';

@Entity('news_posts_translation')
export class NewsPostTranslation extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid' })
	newsPostId: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE })
	languageCode: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	title: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	description: string;

	@Column({ type: 'text' })
	content: string;

	@Column({ default: false })
	isDefault: boolean;

	@ManyToOne(() => NewsPost, (newsPost) => newsPost.newsPostTranslations, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'news_post_id' })
	newsPost: NewsPost;

	// vitual column
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
