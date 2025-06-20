export interface IJwtService {
	generateAccessToken(payload: IJwtPayload): string;
	generateRefreshToken(payload: IJwtPayload): string;
	verifyToken(token: string): IJwtPayload | null;
	decodeToken(token: string): IJwtPayload | null;
}

export interface IJwtPayload {
	userId: string;
	username: string;
	// role: string;
	exp?: number;
}
