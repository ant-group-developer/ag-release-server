export const Permission = {
	DASHBOARD: {
		READ: 'dashboard.read',
	},
	ARTIST: {
		CREATE: 'artist.create',
		READ: 'artist.read',
		UPDATE: 'artist.update',
	},
	DSP: {
		CONFIGURE_INTEGRATION: 'dsp.configure_integration',
		READ: 'dsp.read',
	},
	LABEL: {
		CREATE: 'label.create',
		READ: 'label.read',
		UPDATE: 'label.update',
	},
	RELEASE: {
		REVIEW: 'release.review',
		CREATE: 'release.create',
		READ: 'release.read',
		TAKE_DOWN: 'release.take_down',
		UPDATE: 'release.update',
	},
	TRACK: {
		READ: 'track.read',
	},
} as const;
