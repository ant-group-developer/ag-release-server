export interface VevoGraphqlErrorExtension {
	channel_name?: string;
	code?: string;
	message?: string;
	youtube_channel_id?: string;
	status?: number;
}

export interface VevoGraphqlError {
	message: string;
	extensions?: VevoGraphqlErrorExtension;
	path?: string[];
}

export interface VevoCreateChannelResponse {
	data: {
		createChannel: boolean;
	} | null;
	errors?: VevoGraphqlError[];
}
