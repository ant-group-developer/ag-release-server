import { Auth0TokenPayload } from './token-payload.interface';

export const getIdUserFromPayload = (payload: Auth0TokenPayload) => {
	const userId = payload?.sub?.split('|')?.[1];
	return userId;
};
