export const Permission = {
	DASHBOARD: {
		READ: 'dashboard.read',
	},
	ARTIST: {
		CREATE: 'artist.create',
		READ: 'artist.read',
		UPDATE: 'artist.update',
		DELETE: 'artist.delete',
	},
	DSP: {
		CONFIGURE_INTEGRATION: 'dsp.configure_integration',
		READ: 'dsp.read',
		CREATE: 'dsp.create',
		UPDATE: 'dsp.update',
		DELETE: 'dsp.delete',
		UPDATE_POLICIES: 'dsp.update.policies',
		UPDATE_DEALS: 'dsp.update.deals',
	},
	DSP_SYSTEM: {
		CONFIGURE_INTEGRATION: 'dsp_system.configure_integration',
		READ: 'dsp_system.read',
		CREATE: 'dsp_system.create',
		UPDATE: 'dsp_system.update',
		DELETE: 'dsp_system.delete',
		UPDATE_POLICIES: 'dsp_system.update.policies',
		UPDATE_DEALS: 'dsp_system.update.deals',
	},
	DSP_TENANT: {
		READ: 'dsp_tenant.read',
	},
	LABEL: {
		CREATE: 'label.create',
		READ: 'label.read',
		UPDATE: 'label.update',
		DELETE: 'label.delete',
	},
	RELEASE: {
		REVIEW: 'release.review',
		CREATE: 'release.create',
		READ: 'release.read',
		TAKE_DOWN: 'release.take_down',
		UPDATE: 'release.update',
		DELETE: 'release.delete',
	},
	TRACK: {
		READ: 'track.read',
		SCAN: 'track.scan',
	},
	USER: {
		READ: 'user.read',
		CREATE: 'user.create',
		INVITE: 'user.invite',
		UPDATE_INFO: 'user.update.info',
		UPDATE_STATUS: 'user.update.status',
		UPDATE_ROLE: 'user.update.role',
		UPDATE_TENANT_TYPE: 'user.update.tenant_type',
		DELETE: 'user.delete',
	},
	WORKSPACE: {
		READ: 'workspace.read',
		CREATE: 'workspace.create',
		UPDATE_INFO: 'workspace.update.info',
		UPDATE_STATUS: 'workspace.update.status',
		UPDATE_OWNER: 'workspace.update.owner',
		UPDATE_CONFIG: 'workspace.update.config',
	},
	ISSUE: {
		CREATE: 'issue.create',
		READ: 'issue.read',
		UPDATE: 'issue.update',
		DELETE: 'issue.delete',
	},
	TENANT_ISSUE: {
		READ: 'tenant_issue.read',
		CREATE: 'tenant_issue.create',
		UPDATE: 'tenant_issue.update',
		DELETE: 'tenant_issue.delete',
	},
	TENANT_TIER: {
		READ: 'tenant_tier.read',
		CREATE: 'tenant_tier.create',
		UPDATE: 'tenant_tier.update',
		DELETE: 'tenant_tier.delete',
	},
	ROLE: {
		READ: 'role.read',
	},
	PERMISSION: {
		READ: 'permission.read',
	},
	ANALYTICS: {
		READ: 'analytics.read',
	},
	REVENUE: {
		READ: 'revenue.read',
	},
} as const;
