import { nanoid } from 'nanoid';

export function generateId(length: number = 10) {
	return nanoid(length);
}
