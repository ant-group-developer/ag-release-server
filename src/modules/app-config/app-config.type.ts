export interface Auth0Config {
	clientId: string;
	clientSecret: string;
	domain: string;
	audience: string;
	connectionName: string;
	timeSyncData: string;
}

export interface WebsiteConfig {
	name: string;
	logo: string;
	title: string;
	description: string;
	timeBackupDatabase: string;
}

export interface AppConfigShape {
	auth0: Auth0Config;
	website: WebsiteConfig;
}
