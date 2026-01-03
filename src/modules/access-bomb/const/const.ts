export const services =
	'24T|MXU|7DT|7D9|7D4|ADI|AFT|TAO|AMA|A24|A96|AAT|AMI|ANG|ITM|MFI|M44|APM|AP9|AP4|AVM|AV4|AV9|APS|AP7|A4K|AX1|A4P|AX4|AAM|IHU|ADM|MUD|AWM|BNC|BEA|BSO|DUO|BDM|OCH|BLE|B4E|B9E|BMK|BKD|TKT|KKO|CLT|DEE|DIT|DFL|DUB|FOR|GAA|SMS|GGL|HAR|HCJ|HDS|HDT|H24|T44|ORF|HRA|HRH|HUN|THU|AAP|DX3|IMC|KSH|JNO|KBX|KUA|LLY|LEA|LKD|LSN|TRE|MAB|MXC|ARV|MOK|MTV|MSJ|NEE|NET|OMU|PDX|MOV|PEL|PZR|TRC|QOB|QHQ|Q44|QSI|RAK|MZC|REC|SAA|SCS|SIQ|SXM|SLK|HMP|SCM|SCI|SSO|EZP|TDC|BOM|JOX|TCT|ASP|TQA|TD4|TD9|TOU|TRA|TKD|FIZ|UMA|DME|PVS|LUM|WOO|XAM|XTE|YAN|YAT|ZUN|SVK|MSE|3PL|ACR|AGE|AUD|ADO|ASO|BBC|EEN|VRC|BPX|ILM|CNL|CRV|DJM|E4U|CUE|FAO|ADP|IFM|GNT|HJN|HUA|INR|JXT|KAM|KAA|KDM|KDS|LGM|LDG|SUP|MFG|MOD|MIS|MRI|MUO|NME|NMV|TTM|PNT|CNC|PMY|PJX|QAT|PCM|DIS|S44|SBQ|GRV|STA|SSP|SRP|SDX|SNM|STL|STD|SYT|A4M|GOM|TNS|TLB|ASB|X5M|ZED';

export const services2 = 'BOM|ADM|KBX|TKT|FBL|FBK|AAP|ANG|DEE';

export const GENRES = [
	'Alternative',
	'Alternative Rock',
	'Alternativo & Rock Latino',
	'Anime',
	'Baladas y Boleros',
	'Big Band',
	'Blues',
	'Brazilian',
	'C-Pop',
	'Cantopop/HK-Pop',
	"Children's",
	'Chinese',
	'Christian',
	'Classical',
	'Comedy',
	'Contemporary Latin',
	'Country',
	'Dance',
	'Easy Listening',
	'Educational',
	'Electronic',
	'Enka',
	'Experimental',
	'Fitness & Workout',
	'Folk',
	'French Pop',
	'German Folk',
	'German Pop',
	'Hip-Hop/Rap',
	'Holiday',
	'Indo Pop',
	'Inspirational',
	'Instrumental',
	'J-Pop',
	'Jazz',
	'K-Pop',
	'Karaoke',
	'Kayokyoku',
	'Latin',
	'Latin Jazz',
	'Metal',
	'New Age',
	'Opera',
	'Original Pilipino Music',
	'Pop',
	'Pop Latino',
	'Punk',
	'R&B',
	'Raíces',
	'Reggae',
	'Reggaeton y Hip-Hop',
	'Regional Mexicano',
	'Rock',
	'Salsa y Tropical',
	'Singer/Songwriter',
	'Soul',
	'Soundtrack',
	'Spoken Word',
	'Tai-Pop',
	'Thai Pop',
	'Trot',
	'Vocal/Nostalgia',
	'World',
];

export const HAS_VOCALS_LANGUAGE = [
	'No human vocals',
	'No linguistic content - zxx',
	'Afrikaans - afr',
	'Arabic - ara',
	'Bengali - ben',
	'Bulgarian - bul',
	'Catalan or Valencian - cat',
	'Chinese - zho',
	'Croatian - hrv',
	'Czech - ces',
	'Danish - dan',
	'Dutch or Flemish - nld',
	'English - eng',
	'Estonian - est',
	'Finnish - fin',
	'French - fra',
	'German - deu',
	'Haitian or Haitian Creole - hat',
	'Hebrew - heb',
	'Hindi - hin',
	'Hungarian - hun',
	'Icelandic - isl',
	'Indonesian - ind',
	'Irish - gle',
	'Italian - ita',
	'Japanese - jpn',
	'Kazakh - kaz',
	'Korean - kor',
	'Lao - lao',
	'Latin - lat',
	'Latvian - lav',
	'Lithuanian - lit',
	'Malay - msa',
	'Modern Greek (1453-) - ell',
	'Norwegian - nor',
	'Panjabi or Punjabi - pan',
	'Persian - fas',
	'Polish - pol',
	'Portuguese - por',
	'Romanian - ron',
	'Russian - rus',
	'Sanskrit - san',
	'Slovak - slk',
	'Slovenian - slv',
	'Spanish or Castilian - spa',
	'Swedish - swe',
	'Tagalog - tgl',
	'Tamil - tam',
	'Telugu - tel',
	'Thai - tha',
	'Turkish - tur',
	'Ukrainian - ukr',
	'Urdu - urd',
	'Vietnamese - vie',
	'Yue Chinese - yue',
	'Zulu - zul',
];

export const GENRE_MAPPING: Record<string, string> = {
	// ===== Rock / Pop / Adult =====
	'Soft Rock': 'Rock',
	'Adult Contemporary': 'Pop',
	'Indie Pop': 'Pop',
	Oldies: 'Vocal/Nostalgia',

	// ===== Hip Hop / Rap =====
	'Hip-Hop': 'Hip-Hop/Rap',
	'Hip Hop': 'Hip-Hop/Rap',
	'Hip Hop/Rap': 'Hip-Hop/Rap',
	'UK Hip Hop': 'Hip-Hop/Rap',
	Rap: 'Hip-Hop/Rap',

	// ===== R&B / Soul =====
	'R&B/Soul': 'R&B',

	// ===== Christian =====
	'Christian & Gospel': 'Christian',

	// ===== Latin / Reggaeton =====
	'Reggaeton / Latin Urban': 'Reggaeton y Hip-Hop',
	Pagode: 'World',
	'Bossa Nova': 'Latin Jazz',

	// ===== Afro / African =====
	Afrobeats: 'World',
	'Afro-Pop': 'World',
	'Afro Soul': 'World',
	'Afro-fusion': 'World',
	'Afro-folk': 'World',
	'Afro House': 'Electronic',
	African: 'World',
	'African Dancehall': 'World',
	Highlife: 'World',
	Amapiano: 'World',

	// ===== Instrument / Mood =====
	Piano: 'Instrumental',
	Guitar: 'Instrumental',
	'Chinese Flute': 'Instrumental',
	Ambient: 'New Age',
	Meditation: 'New Age',

	// ===== Electronic / Dance =====
	House: 'Dance',

	// ===== Era / Concept =====
	'Medieval Era': 'Classical',

	// ===== Country / Region misuse =====
	Japan: 'World',
};

export const LANGUAGE_MAPPING: Record<string, string> = {
	// ===== Invalid / Unsupported languages → No linguistic content
	Javanese: 'No linguistic content - zxx',
	Yoruba: 'No linguistic content - zxx',
	Abkhazian: 'No linguistic content - zxx',

	// ===== Not a language
	Instrumental: 'No linguistic content - zxx',

	// ===== Regional / naming mismatch
	'Spanish (Latin America)': 'Spanish or Castilian - spa',

	// ===== Valid languages but missing ISO
	English: 'English - eng',
	Portuguese: 'Portuguese - por',
	Japanese: 'Japanese - jpn',
	Vietnamese: 'Vietnamese - vie',
};
