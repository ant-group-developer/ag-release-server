INSERT INTO roles (name, note, color, creator_id, modifier_id, code)
VALUES
  -- Artist
  ('Artist Admin','Full control over artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.admin'),
  ('Artist Manager','Manage artists, members, payouts, social links, and label links.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.manager'),
  ('Artist Verifier','Verify artists'' identity/ownership.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.verifier'),
  ('Artist Viewer','Read-only access to artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.viewer'),

  -- DSP
  ('DSP Admin','Configure and control DSP integrations.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.admin'),
  ('DSP Operator','Operate catalog syncs and retries; view deliveries/reports.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.operator'),
  ('DSP Viewer','View DSP integrations, deliveries, and reports.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.viewer'),

  -- Genre
  ('Genre Admin','Full control over genres.','#F59E0B', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'genre.admin'),
  ('Genre Editor','Create and edit genres; assign to tracks/releases.','#F59E0B', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'genre.editor'),
  ('Genre Viewer','Read-only access to genres.','#F59E0B', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'genre.viewer'),

  -- Label
  ('Label Admin','Full control over labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.admin'),
  ('Label Manager','Manage labels, members, payouts, and contracts.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.manager'),
  ('Label Verifier','Verify labels and agreements.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.verifier'),
  ('Label Viewer','Read-only access to labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.viewer'),

  -- Release
  ('Release Admin','Full control over releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.admin'),
  ('Release Approver','Approve or reject releases during QA.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.approver'),
  ('Release Editor','Create and edit releases and schedules.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.editor'),
  ('Release Publisher','Publish/unpublish releases and submit to DSPs.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.publisher'),
  ('Release Viewer','Read-only access to releases, including status and history.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.viewer'),

  -- Track
  ('Track Admin','Full control over tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.admin'),
  ('Track Approver','Approve or reject tracks during QA.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.approver'),
  ('Track Audio Editor','Upload and manage audio assets for tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.audioEditor'),
  ('Track Editor','Create and edit tracks, ISRCs, lyrics; attach to releases.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.editor'),
  ('Track Metadata Editor','Edit track metadata like ISRCs and lyrics.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.metadataEditor'),
  ('Track Viewer','Read-only access to tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.viewer')
ON CONFLICT (name) DO UPDATE SET
  note  = EXCLUDED.note,
  color = EXCLUDED.color;