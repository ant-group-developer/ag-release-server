import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { TypeDateTimeline } from './statistics.enum';

dayjs.extend(isSameOrBefore);

export enum GroupFormatDate {
	DMY = '%d-%m-%Y',
	MY = '%m-%Y',
	Y = '%Y',
}

export function getGroupByFormatAndDateList({
	startDate,
	endDate,
	typeDateTimeline,
}: {
	startDate: Date;
	endDate: Date;
	typeDateTimeline: TypeDateTimeline;
}): {
	groupByFormat: GroupFormatDate;
	dayjsFormat: string;
	dateList: string[];
} {
	let groupByFormat: GroupFormatDate;
	let dayjsFormat: string;

	switch (typeDateTimeline) {
		case TypeDateTimeline.DAY:
			dayjsFormat = 'DD-MM-YYYY';
			groupByFormat = GroupFormatDate.DMY;
			break;
		case TypeDateTimeline.MONTH:
			dayjsFormat = 'MM-YYYY';
			groupByFormat = GroupFormatDate.MY;
			break;
		case TypeDateTimeline.YEAR:
			dayjsFormat = 'YYYY';
			groupByFormat = GroupFormatDate.Y;
			break;
		default:
			throw new Error('Invalid timeline type.');
	}

	const dateList = generateDateList({
		startDate,
		endDate,
		typeDateTimeline,
	});

	return { groupByFormat, dayjsFormat, dateList };
}

export function generateDateList({
	startDate,
	endDate,
	typeDateTimeline,
}: {
	startDate: Date;
	endDate: Date;
	typeDateTimeline: TypeDateTimeline;
}): string[] {
	const dateList: string[] = [];

	let current = dayjs(startDate).startOf(typeDateTimeline);
	const end = dayjs(endDate).startOf(typeDateTimeline);

	while (current.isSameOrBefore(end)) {
		let bucket: string;
		if (typeDateTimeline === TypeDateTimeline.DAY) {
			bucket = current.format('DD-MM-YYYY');
		} else if (typeDateTimeline === TypeDateTimeline.MONTH) {
			bucket = current.format('MM-YYYY');
		} else {
			bucket = current.format('YYYY');
		}

		dateList.push(bucket);
		current = current.add(1, typeDateTimeline);
	}

	return dateList;
}
