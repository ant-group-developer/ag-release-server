export enum FieldOrderLabel {
	NAME = 'label.name',
	// PICTURE = 'picture',
	// DESCRIPTION = 'description',
	CREATED_AT = 'label.createdAt',
	UPDATED_AT = 'label.updatedAt',

	// virtual
	TRACK_COUNT = 'track_count',
	RELEASE_COUNT = 'release_count',
	NAME_TENANT = 'tenant.name',
}

export enum VirtualColumnsLabel {
	TRACK_COUNT = FieldOrderLabel.TRACK_COUNT,
	RELEASE_COUNT = FieldOrderLabel.RELEASE_COUNT,
	NAME_TENANT = FieldOrderLabel.NAME_TENANT,
}

export const VirtualColumnsLabelArr = Object.values(
	VirtualColumnsLabel,
) as string[];
