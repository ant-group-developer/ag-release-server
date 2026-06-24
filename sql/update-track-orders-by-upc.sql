BEGIN;

CREATE TEMP TABLE tmp_track_order_by_upc (
	upc text NOT NULL,
	title text NOT NULL,
	new_order int NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_track_order_by_upc (upc, title, new_order) VALUES
	-- Shariif - 701798205348
	('701798205348', 'Masoyi na', 1),
	('701798205348', 'Na Dawo', 2),
	('701798205348', 'Ranar Rabuwa', 3),
	('701798205348', 'Soyayya', 4),
	('701798205348', 'Faruq', 5),
	('701798205348', 'Guguwar So', 6),
	('701798205348', 'Halisa', 7),
	('701798205348', 'Jini na', 8),
	('701798205348', 'Mai Gida', 9),
	('701798205348', 'Ki So ni', 10),
	('701798205348', 'Kajiya', 11),
	('701798205348', 'Ka so a So ka', 12),
	('701798205348', 'Jinin Jiki na', 13),

	-- Love in the Rain - 7316480623961
	('7316480623961', 'cloudy sky', 1),
	('7316480623961', 'Connection', 2),
	('7316480623961', 'Dancing wild in summer rains', 3),
	('7316480623961', 'empty cup', 4),
	('7316480623961', 'fingertips', 5),
	('7316480623961', 'I''m all in', 6),
	('7316480623961', 'Kiss Me in the Rain', 7),
	('7316480623961', 'Love in the Rain', 8),
	('7316480623961', 'Love Poems', 9),
	('7316480623961', 'My heart', 10),
	('7316480623961', 'Wastin all my time', 11),
	('7316480623961', 'where we begin', 12),

	-- Wild Unity - 7316480879856
	('7316480879856', 'Dance of the Tribe', 1),
	('7316480879856', 'Dancing', 2),
	('7316480879856', 'Djembe Rising', 3),
	('7316480879856', 'Endless Stage', 4),
	('7316480879856', 'Feet on Fire', 5),
	('7316480879856', 'Festival Flame', 6),
	('7316480879856', 'Festival Love', 7),
	('7316480879856', 'Flow of the Fiesta', 8),
	('7316480879856', 'Lights on the Beat', 9),
	('7316480879856', 'Loud and Free', 10),
	('7316480879856', 'March of the Dancers', 11),
	('7316480879856', 'Sahara Beats', 12),
	('7316480879856', 'Sunset in Samba', 13),
	('7316480879856', 'Sunset in Sao Paulo', 14),
	('7316480879856', 'Vibe Parade', 15),
	('7316480879856', 'Wild Unity', 16),

	-- Rain's Gentle Weep - 7316480610152
	('7316480610152', 'Cafe''s Soft Haze', 1),
	('7316480610152', 'Dusk Over Still Waters', 2),
	('7316480610152', 'Faint Grain', 3),
	('7316480610152', 'Fog on Forgotten Roads', 4),
	('7316480610152', 'Hollow Clay', 5),
	('7316480610152', 'Lamplight''s Whisper', 6),
	('7316480610152', 'Leaves on Winding Paths', 7),
	('7316480610152', 'Oak''s Silent Vow', 8),
	('7316480610152', 'Petals on Quiet Paths', 9),
	('7316480610152', 'Rain''s Fleeting Dance', 10),
	('7316480610152', 'Rain''s Gentle Weep', 11),
	('7316480610152', 'Snow''s Lonely Drift', 12),
	('7316480610152', 'Tavern''s Warm Spark', 13),
	('7316480610152', 'Train''s Distant Hum', 14),
	('7316480610152', 'Willow''s Tender Air', 15),

	-- Brave Like Us - 7316480640630
	('7316480640630', 'A Line of Foam', 1),
	('7316480640630', 'As the Earth Turns', 2),
	('7316480640630', 'Beneath the Same Flag', 3),
	('7316480640630', 'Brave Like Us', 4),
	('7316480640630', 'Brighter Than Yesterday', 5),
	('7316480640630', 'From Sea to Sky', 6),
	('7316480640630', 'Home in My Heart', 7),
	('7316480640630', 'In Freedom''s Light', 8),
	('7316480640630', 'One Voice, One Land', 9),
	('7316480640630', 'Our Perfect Day', 10),
	('7316480640630', 'Rise With Me', 11),
	('7316480640630', 'The Pulse of the Land', 12),
	('7316480640630', 'The Sound of Foam', 13),
	('7316480640630', 'This Ground We Stand', 14),
	('7316480640630', 'Voice of the People', 15),
	('7316480640630', 'Voices in the Crowd', 16),
	('7316480640630', 'Where Freedom Grows', 17),
	('7316480640630', 'You Were the Light', 18),

	-- Downtown - 7316480879900
	('7316480879900', 'Above the Static', 1),
	('7316480879900', 'Air Between Us', 2),
	('7316480879900', 'Balance Locked', 3),
	('7316480879900', 'Click to Surface', 4),
	('7316480879900', 'Downtown', 5),
	('7316480879900', 'Framework', 6),
	('7316480879900', 'Last Table Left', 7),
	('7316480879900', 'Line of Motion', 8),
	('7316480879900', 'Over the Avenue', 9),
	('7316480879900', 'Parallel Curve', 10),
	('7316480879900', 'Pressure of Skylight', 11),
	('7316480879900', 'Rooftop Channel', 12),
	('7316480879900', 'Shadows on 24h', 13),
	('7316480879900', 'Sharp Transit~1', 14),
	('7316480879900', 'Strike Formation', 15),
	('7316480879900', 'Thin Line', 16),
	('7316480879900', 'Ultra Neutral', 17),
	('7316480879900', 'Viewfinder', 18),

	-- Eternal Dawn - 7316480622698
	('7316480622698', 'adventurous sail', 1),
	('7316480622698', 'Be a light', 2),
	('7316480622698', 'Eternity', 3),
	('7316480622698', 'immense', 4),
	('7316480622698', 'in the fall', 5),
	('7316480622698', 'love is you', 6),
	('7316480622698', 'Memories', 7),
	('7316480622698', 'Mystery', 8),
	('7316480622698', 'pink rain', 9),
	('7316480622698', 'Pray', 10),
	('7316480622698', 'sea of memory', 11),
	('7316480622698', 'Sometimes', 12),
	('7316480622698', 'The ocean', 13),
	('7316480622698', 'The story', 14),
	('7316480622698', 'Waterfall', 15),
	('7316480622698', 'Your Angel', 16),

	-- Bittersweet - 7316480595886
	('7316480595886', 'Love Despair', 1),
	('7316480595886', 'Last Snow', 2),
	('7316480595886', 'Hometown', 3),
	('7316480595886', 'Die 9 Times', 4),
	('7316480595886', 'Fly High', 5),
	('7316480595886', 'Bittersweet', 6),
	('7316480595886', 'Cigarettes And Cheap Perfume', 7),
	('7316480595886', 'Time To Heaven', 8),
	('7316480595886', 'Night', 9),
	('7316480595886', 'Whats Life', 10),
	('7316480595886', 'Paralel Time', 11),
	('7316480595886', 'My Home', 12),
	('7316480595886', 'Love', 13),

	-- Lunar Drift - 7316480610855
	('7316480610855', 'A call from Heaven', 1),
	('7316480610855', 'Andromeda Flow', 2),
	('7316480610855', 'Celestial Fade', 3),
	('7316480610855', 'Comet Trail', 4),
	('7316480610855', 'Dark Side Waltz', 5),
	('7316480610855', 'Echoes of Mars', 6),
	('7316480610855', 'God is my refuge', 7),
	('7316480610855', 'Jupiter Sleep', 8),
	('7316480610855', 'Light unto my path', 9),
	('7316480610855', 'Lunar Drift', 10),
	('7316480610855', 'Prayer in the night', 11),
	('7316480610855', 'Soak', 12),
	('7316480610855', 'Starborn', 13),
	('7316480610855', 'Void Whisper', 14),
	('7316480610855', 'Zero G', 15),

	-- Soulmate - 7316480624128
	('7316480624128', 'Cared for me', 1),
	('7316480624128', 'Crazy Little Love', 2),
	('7316480624128', 'Flash of light', 3),
	('7316480624128', 'For the dawn', 4),
	('7316480624128', 'If I Can''t Have You', 5),
	('7316480624128', 'It''s not easy', 6),
	('7316480624128', 'Just waiting for more', 7),
	('7316480624128', 'My Best Friend', 8),
	('7316480624128', 'My Wedding', 9),
	('7316480624128', 'Over the soul', 10),
	('7316480624128', 'Soulmate', 11),
	('7316480624128', 'When I Think of You', 12),

	-- The Color of Leaving - 7316480641309
	('7316480641309', 'I Smiled Before You Did', 1),
	('7316480641309', 'Love Sounds Like You', 2),
	('7316480641309', 'Mug Rings on the Desk', 3),
	('7316480641309', 'No Signal, Just Memory', 4),
	('7316480641309', 'Playlist Full of You', 5),
	('7316480641309', 'Promises We Never Kept', 6),
	('7316480641309', 'Rain Came In Anyway', 7),
	('7316480641309', 'The Color of Leaving', 8),
	('7316480641309', 'The Left Side Is Yours', 9),
	('7316480641309', 'You Answered Before the Ring', 10),
	('7316480641309', 'You left your playlist on', 11),
	('7316480641309', 'Your Hair''s Still on My Hoodie', 12),
	('7316480641309', 'Your Side''s Warmer', 13),

	-- Solarya - 7316480604762
	('7316480604762', 'Nythera', 1),
	('7316480604762', 'Ocearnya', 2),
	('7316480604762', 'Oceavara', 3),
	('7316480604762', 'Offline Tears', 4),
	('7316480604762', 'Parallel Chill', 5),
	('7316480604762', 'Pop-Up', 6),
	('7316480604762', 'Pure Mood', 7),
	('7316480604762', 'Quiet Period', 8),
	('7316480604762', 'Reel Feed', 9),
	('7316480604762', 'Respawn', 10),
	('7316480604762', 'Rewind Reality', 11),
	('7316480604762', 'River Loop', 12),
	('7316480604762', 'Rooftop', 13),
	('7316480604762', 'Routine', 14),
	('7316480604762', 'Sakura Fade', 15),
	('7316480604762', 'Save Point Blues', 16),
	('7316480604762', 'Seaphoria', 17),
	('7316480604762', 'Selfvine', 18),
	('7316480604762', 'Serapha Mist', 19),
	('7316480604762', 'Seravine', 20),
	('7316480604762', 'Sleepwriting', 21),
	('7316480604762', 'Slow Toast', 22),
	('7316480604762', 'Solarya', 23),

	-- One Love Ago - 7316480641255
	('7316480641255', 'Every Second Was You', 1),
	('7316480641255', 'Falling, Always Falling', 2),
	('7316480641255', 'Fell Like the Rain', 3),
	('7316480641255', 'Held by the Wind', 4),
	('7316480641255', 'Linger in the Wind', 5),
	('7316480641255', 'Lost in the Foam', 6),
	('7316480641255', 'Lost in the Wind Again', 7),
	('7316480641255', 'Louder Than Goodbye', 8),
	('7316480641255', 'Love in Slow Motion', 9),
	('7316480641255', 'Love Me, Still', 10),
	('7316480641255', 'Not Just a Feeling', 11),
	('7316480641255', 'One Love Ago', 12),
	('7316480641255', 'Only You Could Know', 13),
	('7316480641255', 'Sea of Our Days', 14),
	('7316480641255', 'Secrets of the Ocean', 15),
	('7316480641255', 'Silent as the Sky', 16),
	('7316480641255', 'Soft as the Sea', 17),
	('7316480641255', 'Sunset in Your Eyes', 18),
	('7316480641255', 'The Heart You Left', 19),
	('7316480641255', 'Under the Willow', 20),
	('7316480641255', 'What Love Left Behind', 21),
	('7316480641255', 'Where Love Begins', 22),
	('7316480641255', 'Where We Used to Float', 23),
	('7316480641255', 'You Still Feel Like Home', 24),
	('7316480641255', 'You Were Always Mine', 25),

	-- Blade of the Moon King - 7316480640593
	('7316480640593', 'Mario', 1),
	('7316480640593', 'Peak', 2),
	('7316480640593', 'Summitara', 3),
	('7316480640593', 'Silvertop', 4),
	('7316480640593', 'Aetherfang', 5),
	('7316480640593', 'Banshee''s Lament', 6),
	('7316480640593', 'Skydrift', 7),
	('7316480640593', 'Skyrim', 8),
	('7316480640593', 'Aetherpeak', 9),
	('7316480640593', 'Wilderpeak', 10),
	('7316480640593', 'Courtyard', 11),
	('7316480640593', 'Crimson Crown', 12),
	('7316480640593', 'Blade of the Moon King', 13),
	('7316480640593', 'Stonehaven', 14),
	('7316480640593', 'Apexion', 15),
	('7316480640593', 'Ironcrag', 16),
	('7316480640593', 'Frostmantle', 17),
	('7316480640593', 'Chinatown', 18),
	('7316480640593', 'Mystral Ridge', 19),
	('7316480640593', 'Morgan', 20),
	('7316480640593', 'Sena', 21),
	('7316480640593', 'The Silent Peaks', 22),
	('7316480640593', 'Bowl', 23),
	('7316480640593', 'Highspire', 24),
	('7316480640593', 'Loyalty', 25),
	('7316480640593', 'Embermount', 26),
	('7316480640593', 'Montara', 27),
	('7316480640593', 'Peakvalor', 28),
	('7316480640593', 'Ridgeborn', 29),
	('7316480640593', 'Golden Summit', 30),

	-- Soft Rain - 7316480641200
	('7316480641200', 'Whistle of the Forgotten #2', 1),
	('7316480641200', 'Barefoot on Grass', 2),
	('7316480641200', 'Between the Leaves', 3),
	('7316480641200', 'Chrono Flute', 4),
	('7316480641200', 'Dewdrop Waltz', 5),
	('7316480641200', 'Distant Shore', 6),
	('7316480641200', 'Drifting Clouds', 7),
	('7316480641200', 'Echo of You', 8),
	('7316480641200', 'Fading Light', 9),
	('7316480641200', 'Falling Away', 10),
	('7316480641200', 'Gentle Wind', 11),
	('7316480641200', 'Loop of Memories', 12),
	('7316480641200', 'Midnight Echo', 13),
	('7316480641200', 'Note in the Silence', 14),
	('7316480641200', 'Old Path', 15),
	('7316480641200', 'Passing Moments', 16),
	('7316480641200', 'Quiet Alley', 17),
	('7316480641200', 'Serenade for the Unknown', 18),
	('7316480641200', 'Slow-Mo Sunrise', 19),
	('7316480641200', 'Soft Rain', 20),
	('7316480641200', 'Stars'' Fading Gleam', 21),
	('7316480641200', 'Steps in the Fog', 22),
	('7316480641200', 'Whispered Steps', 23),
	('7316480641200', 'Whispers of the Broken Clock', 24);

-- Check before COMMIT:
-- 1) Missing release/track rows. This should return 0 rows.
SELECT o.*
FROM tmp_track_order_by_upc o
LEFT JOIN releases r ON r.upc = o.upc
LEFT JOIN tracks t
	ON t.release_id = r.id
	AND replace(replace(lower(trim(t.title)), '’', ''''), '‘', '''')
		= replace(replace(lower(trim(o.title)), '’', ''''), '‘', '''')
WHERE r.id IS NULL OR t.id IS NULL;

-- 2) Ambiguous title rows in the same release. This should return 0 rows.
SELECT o.upc, o.title, count(t.id) AS matched_tracks
FROM tmp_track_order_by_upc o
JOIN releases r ON r.upc = o.upc
JOIN tracks t
	ON t.release_id = r.id
	AND replace(replace(lower(trim(t.title)), '’', ''''), '‘', '''')
		= replace(replace(lower(trim(o.title)), '’', ''''), '‘', '''')
GROUP BY o.upc, o.title
HAVING count(t.id) <> 1;

-- Move all tracks in selected releases to temporary negative orders first,
-- avoiding UQ_tracks_release_id_order conflicts during reorder.
WITH selected_releases AS (
	SELECT DISTINCT r.id
	FROM releases r
	JOIN tmp_track_order_by_upc o ON o.upc = r.upc
),
temp_orders AS (
	SELECT
		t.id,
		-100000 - row_number() OVER (ORDER BY t.release_id, t.id) AS temp_order
	FROM tracks t
	JOIN selected_releases sr ON sr.id = t.release_id
)
UPDATE tracks t
SET "order" = temp_orders.temp_order
FROM temp_orders
WHERE t.id = temp_orders.id;

-- Apply final orders by UPC + track title.
UPDATE tracks t
SET "order" = o.new_order
FROM tmp_track_order_by_upc o
JOIN releases r ON r.upc = o.upc
WHERE t.release_id = r.id
	AND replace(replace(lower(trim(t.title)), '’', ''''), '‘', '''')
		= replace(replace(lower(trim(o.title)), '’', ''''), '‘', '''');

COMMIT;
