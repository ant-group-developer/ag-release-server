export enum FieldOrderNewsCategory {
	NAME_VI = 'newsCategory.nameVi',
	NAME_EN = 'newsCategory.nameEn',
	ORDER = 'newsCategory.order',
	CREATED_AT = 'newsCategory.createdAt',
	UPDATED_AT = 'newsCategory.updatedAt',
}

export interface NewsCategoryTree {
	id: string;
	nameVi: string;
	nameEn: string;
	descriptionVi: string | null;
	descriptionEn: string | null;
	order: number;
	parentId: string | null;
	children: NewsCategoryTree[];
}
