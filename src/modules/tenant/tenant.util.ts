type ItemWithParent = {
	id: string | number;
	name: string;
	parent?: { id?: string | number | null } | null;
	// ...anything else you selected
};

export function parentFirstSort<T extends ItemWithParent>(items: T[]): T[] {
	const byId = new Map(items.map((i) => [i.id, i]));

	// bucket children by parentId (null for roots)
	const buckets = new Map<string | number | null, T[]>();
	for (const i of items) {
		const parentId = (i.parent as any)?.id ?? (i as any).parentId ?? null; // handles either object or scalar id
		if (!buckets.has(parentId)) buckets.set(parentId, []);
		buckets.get(parentId)!.push(i);
	}

	// sort siblings by name (optional)
	for (const arr of buckets.values()) {
		arr.sort((a, b) => a.name.localeCompare(b.name));
	}

	// roots = no parent or parent not present in the list
	const roots = (buckets.get(null) ?? []).concat(
		items.filter(
			(i) =>
				((i.parent as any)?.id ?? (i as any).parentId ?? null) !==
					null &&
				!byId.has((i.parent as any)?.id ?? (i as any).parentId),
		),
	);

	// DFS to push parent then its children
	const result: T[] = [];
	const visited = new Set<string | number>();
	const visit = (node: T) => {
		if (visited.has(node.id)) return;
		visited.add(node.id);
		result.push(node);
		const kids = buckets.get(node.id);
		if (kids) for (const k of kids) visit(k);
	};

	for (const r of roots) visit(r);
	// in case some were missed (cycles/orphans), append them deterministically
	for (const i of items) if (!visited.has(i.id)) visit(i);

	return result;
}
