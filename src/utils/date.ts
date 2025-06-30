import dayjs from 'dayjs';

export function getDateRange(dateRange?: Date[]): Date[] {
	const defaultValue = [
		dayjs().startOf('month').toDate(),
		dayjs().endOf('month').toDate(),
	];
	const [start, end] = dateRange?.length === 2 ? dateRange : defaultValue;
	return [start, end];
}

export function generateFileNameWithTimestamp(
	originalFileName: string,
): string {
	const now = new Date();

	const yyyy = now.getFullYear();
	const MM = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const HH = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');

	const timestamp = `${yyyy}-${MM}-${dd}_${HH}-${mm}-${ss}`;

	// const dotIndex = originalFileName.lastIndexOf('.');
	// const baseName =
	// 	dotIndex >= 0 ? originalFileName.slice(0, dotIndex) : originalFileName;
	// const extension = dotIndex >= 0 ? originalFileName.slice(dotIndex) : '';

	return `${timestamp}-${originalFileName}`;
}
