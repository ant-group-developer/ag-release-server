import { ResponseError } from 'src/common/dtos/response.dto';

export function ensureUUID(id: string) {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			id,
		)
	) {
		throw new ResponseError({ message: 'Invalid UUID' });
	}
}
