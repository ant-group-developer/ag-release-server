export const normalizeStr = (str?: string) => {
	if (!str) return '';
	return str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
};
