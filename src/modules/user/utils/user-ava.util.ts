// lib/avatar-tailwind.ts
export const TAILWIND_HEX_400_700 = {
	red: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
	orange: { 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c' },
	amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
	yellow: { 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207' },
	lime: { 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f' },
	green: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
	emerald: { 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857' },
	teal: { 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
	cyan: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
	sky: { 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
	blue: { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
	indigo: { 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
	violet: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
	purple: { 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce' },
	fuchsia: { 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf' },
	pink: { 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d' },
	rose: { 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c' },
} as const;

export type TailwindName = keyof typeof TAILWIND_HEX_400_700;
export type TailwindShade = 400 | 500 | 600 | 700;

export const ALL_TAILWIND_NAMES = Object.keys(
	TAILWIND_HEX_400_700,
) as TailwindName[];
export const ALL_TAILWIND_SHADES: TailwindShade[] = [400, 500, 600, 700];

export function getTailwindHex(name: TailwindName, shade: TailwindShade) {
	return TAILWIND_HEX_400_700[name][shade];
}

function flattenTailwind(
	names: TailwindName[] = ALL_TAILWIND_NAMES,
	shades: TailwindShade[] = ALL_TAILWIND_SHADES,
): string[] {
	const out: string[] = [];
	for (const n of names)
		for (const s of shades) out.push(getTailwindHex(n, s));
	return out;
}

function pickDeterministic(seed: string, list: ReadonlyArray<string>) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return list[Math.abs(h) % list.length];
}

const stripHash = (hex: string) => hex.replace(/^#/, '').toUpperCase();

// WCAG-ish auto text color
function relLum(hexNoHash: string) {
	const [r, g, b] = [0, 2, 4].map(
		(i) => parseInt(hexNoHash.slice(i, i + 2), 16) / 255,
	);
	const c = [r, g, b].map((v) =>
		v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
	);
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function bestText(bgHexNoHash: string) {
	const L = relLum(bgHexNoHash);
	const contrastWhite = (1 + 0.05) / (L + 0.05);
	const contrastBlack = (L + 0.05) / 0.05;
	return contrastWhite >= contrastBlack ? 'FFFFFF' : '000000';
}

// ---- The avatar URL helper (supports Tailwind picking) ----
export function getAvatarUrl(
	name: string,
	opts?: {
		size?: number;
		fontSize?: number; // 0.1–1 (fraction of size)
		length?: number;
		rounded?: boolean;
		bold?: boolean;
		uppercase?: boolean;
		format?: 'png' | 'svg';
		text?: 'auto' | 'white' | 'black';

		// Choose background:
		bg?: string; // explicit HEX wins if provided
		tailwind?: {
			name?: TailwindName; // e.g. 'indigo'
			shade?: TailwindShade; // e.g. 600
			allowedNames?: TailwindName[]; // limit families to pick from
			allowedShades?: TailwindShade[]; // limit shades to pick from
		};
	},
) {
	const {
		size = 128,
		fontSize = 0.4,
		length = 2,
		rounded = false,
		bold = false,
		uppercase = true,
		format = 'png',
		text = 'white',
		bg,
		tailwind,
	} = opts ?? {};

	// Resolve background color
	let bgHex: string;
	if (bg) {
		bgHex = stripHash(bg);
	} else if (tailwind?.name && tailwind?.shade) {
		bgHex = stripHash(getTailwindHex(tailwind.name, tailwind.shade));
	} else {
		// Deterministic pick from allowed families/shades (or all)
		const names =
			tailwind?.allowedNames ??
			(tailwind?.name ? [tailwind.name] : ALL_TAILWIND_NAMES);
		const shades =
			tailwind?.allowedShades ??
			(tailwind?.shade ? [tailwind.shade] : ALL_TAILWIND_SHADES);
		const candidates = flattenTailwind(names, shades);
		bgHex = stripHash(pickDeterministic(name, candidates));
	}

	const color =
		text === 'white'
			? 'FFFFFF'
			: text === 'black'
				? '000000'
				: bestText(bgHex);

	const params = new URLSearchParams({
		name: (name || '?').trim(),
		size: String(size),
		'font-size': String(fontSize),
		background: bgHex,
		color,
		length: String(length),
		rounded: String(rounded),
		uppercase: String(uppercase),
		bold: String(bold),
		format,
	});

	return `https://ui-avatars.com/api/?${params.toString()}`;
}
