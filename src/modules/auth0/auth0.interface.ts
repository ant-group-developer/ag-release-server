export interface Auth0TokenResponse {
	access_token: string;
	scope: string;
	expires_in: number;
	token_type: string;
}
