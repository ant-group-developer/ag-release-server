export enum FieldOrderLabel {
	NAME = 'name',
	// PICTURE = 'picture',
	// DESCRIPTION = 'description',
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',

	// virtual
	TRACK_COUNT = 'track_count',
	RELEASE_COUNT = 'release_count',
}

export enum VirtualColumnsLabel {
	TRACK_COUNT = FieldOrderLabel.TRACK_COUNT,
	RELEASE_COUNT = FieldOrderLabel.RELEASE_COUNT,
}

export const VirtualColumnsLabelArr = Object.values(
	VirtualColumnsLabel,
) as string[];
