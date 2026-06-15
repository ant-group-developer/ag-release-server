INSERT INTO roles (name, note, color, creator_id, modifier_id, code)
VALUES
  -- Analytics
  ('Analytics Admin','Full control over analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.admin'),
  ('Analytics Creator','Create analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.creator'),
  ('Analytics Editor','Edit analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.editor'),
  ('Analytics Viewer','Read-only access to analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.viewer'),

  -- Artist
  ('Artist Admin','Full control over artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.admin'),
  ('Artist Creator','Create artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.creator'),
  ('Artist Editor','Edit artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.editor'),
  ('Artist Viewer','Read-only access to artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.viewer'),

  -- Dashboard
  ('Dashboard Admin','Full control over dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.admin'),
  ('Dashboard Creator','Create dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.creator'),
  ('Dashboard Editor','Edit dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.editor'),
  ('Dashboard Viewer','Read-only access to dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.viewer'),

  -- DSP
  ('DSP Admin','Full control over DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.admin'),
  ('DSP Creator','Create DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.creator'),
  ('DSP Editor','Edit DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.editor'),
  ('DSP Viewer','Read-only access to DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.viewer'),

  -- Issue
  ('Issue Admin','Full control over issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.admin'),
  ('Issue Creator','Create issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.creator'),
  ('Issue Editor','Edit issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.editor'),
  ('Issue Viewer','Read-only access to issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.viewer'),

  -- Label
  ('Label Admin','Full control over labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.admin'),
  ('Label Creator','Create labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.creator'),
  ('Label Editor','Edit labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.editor'),
  ('Label Viewer','Read-only access to labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.viewer'),

  -- Release
  ('Release Admin','Full control over releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.admin'),
  ('Release Creator','Create releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.creator'),
  ('Release Editor','Edit releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.editor'),
  ('Release Viewer','Read-only access to releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.viewer'),

  -- Release Video
  ('Release Video Admin','Full control over release videos.','#0EA5E9', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release_video.admin'),
  ('Release Video Creator','Create release videos.','#0EA5E9', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release_video.creator'),
  ('Release Video Editor','Edit release videos.','#0EA5E9', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release_video.editor'),
  ('Release Video Viewer','Read-only access to release videos.','#0EA5E9', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release_video.viewer'),

  -- Revenue
  ('Revenue Admin','Full control over revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.admin'),
  ('Revenue Creator','Create revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.creator'),
  ('Revenue Editor','Edit revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.editor'),
  ('Revenue Viewer','Read-only access to revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.viewer'),

  -- Tenant Issue
  ('Tenant Issue Admin','Full control over tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.admin'),
  ('Tenant Issue Creator','Create tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.creator'),
  ('Tenant Issue Editor','Edit tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.editor'),
  ('Tenant Issue Viewer','Read-only access to tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.viewer'),

  -- Tenant Tier
  ('Tenant Tier Admin','Full control over tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.admin'),
  ('Tenant Tier Creator','Create tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.creator'),
  ('Tenant Tier Editor','Edit tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.editor'),
  ('Tenant Tier Viewer','Read-only access to tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.viewer'),

  -- Track
  ('Track Admin','Full control over tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.admin'),
  ('Track Creator','Create tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.creator'),
  ('Track Editor','Edit tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.editor'),
  ('Track Viewer','Read-only access to tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.viewer'),

  -- User
  ('User Admin','Full control over users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.admin'),
  ('User Creator','Create users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.creator'),
  ('User Editor','Edit users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.editor'),
  ('User Viewer','Read-only access to users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.viewer'),

  -- Workspace
  ('Workspace Admin','Full control over workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.admin'),
  ('Workspace Creator','Create workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.creator'),
  ('Workspace Editor','Edit workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.editor'),
  ('Workspace Viewer','Read-only access to workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.viewer')
ON CONFLICT (name) DO UPDATE SET
  note  = EXCLUDED.note,
  color = EXCLUDED.color;