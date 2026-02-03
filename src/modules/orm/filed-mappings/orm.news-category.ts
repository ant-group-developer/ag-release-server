export const NewsCategoryFieldsSimple = {
	ID: 'newsCategory.id',
	NAME_VI: 'newsCategory.nameVi',
	NAME_EN: 'newsCategory.nameEn',
	DESCRIPTION_VI: 'newsCategory.descriptionVi',
	DESCRIPTION_EN: 'newsCategory.descriptionEn',
} as const;

export const ALL_NEWS_CATEGORY_FIELDS_SIMPLE = Object.values(
	NewsCategoryFieldsSimple,
);
