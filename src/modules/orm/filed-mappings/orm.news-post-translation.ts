export const NewsPostTransLationFieldsSimple = {
	ID: 'newsPostTranslation.id',
	NEWS_POST_ID: 'newsPostTranslation.newsPostId',
	LANGUAGE_CODE: 'newsPostTranslation.languageCode',
	TITLE: 'newsPostTranslation.title',
	DESCRIPTION: 'newsPostTranslation.description',
	CONTENT: 'newsPostTranslation.content',
	IS_DEFAULT: 'newsPostTranslation.isDefault',
} as const;

export type NewsPostTranslationFieldKey =
	keyof typeof NewsPostTransLationFieldsSimple;

export const ALL_NEWS_POST_TRANSLATION_FILEDS_SIMPLE = Object.values(
	NewsPostTransLationFieldsSimple,
);
