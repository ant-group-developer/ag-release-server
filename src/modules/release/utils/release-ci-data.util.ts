export const assignMatchTrack = (
	item: any,
	ciTrack: any,
	type: string,
	usedCiTracks: Set<any>,
) => {
	const trackNumber = parseInt(ciTrack.track_number, 10);
	if (!isNaN(trackNumber)) {
		item.tempOrder = trackNumber;
		item.matchType = type;
		item.matchedCiTrack = ciTrack;
		usedCiTracks.add(ciTrack);
	}
};
