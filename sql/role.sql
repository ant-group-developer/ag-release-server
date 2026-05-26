INSERT INTO roles (name, note, color, creator_id, modifier_id, code, is_default)
VALUES
  -- Analytics
  ('Analytics Admin','Full control over analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.admin', false),
  ('Analytics Creator','Create analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.creator', false),
  ('Analytics Editor','Edit analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.editor', false),
  ('Analytics Viewer','Read-only access to analytics.','#84CC16', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'analytics.viewer', true),
  -- Artist
  ('Artist Admin','Full control over artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.admin', false),
  ('Artist Creator','Create artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.creator', false),
  ('Artist Editor','Edit artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.editor', false),
  ('Artist Viewer','Read-only access to artists.','#8B5CF6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'artist.viewer', true),
  -- Dashboard
  ('Dashboard Admin','Full control over dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.admin', false),
  ('Dashboard Creator','Create dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.creator', false),
  ('Dashboard Editor','Edit dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.editor', false),
  ('Dashboard Viewer','Read-only access to dashboard.','#F43F5E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dashboard.viewer', true),
  -- DSP
  ('DSP Admin','Full control over DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.admin', false),
  ('DSP Creator','Create DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.creator', false),
  ('DSP Editor','Edit DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.editor', false),
  ('DSP Viewer','Read-only access to DSPs.','#06B6D4', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'dsp.viewer', false),
  -- Issue
  ('Issue Admin','Full control over issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.admin', false),
  ('Issue Creator','Create issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.creator', false),
  ('Issue Editor','Edit issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.editor', false),
  ('Issue Viewer','Read-only access to issues.','#EAB308', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'issue.viewer', false),
  -- Label
  ('Label Admin','Full control over labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.admin', false),
  ('Label Creator','Create labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.creator', false),
  ('Label Editor','Edit labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.editor', false),
  ('Label Viewer','Read-only access to labels.','#EC4899', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'label.viewer', true),
  -- Release
  ('Release Admin','Full control over releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.admin', false),
  ('Release Creator','Create releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.creator', false),
  ('Release Editor','Edit releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.editor', false),
  ('Release Viewer','Read-only access to releases.','#2563EB', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'release.viewer', true),
  -- Revenue
  ('Revenue Admin','Full control over revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.admin', false),
  ('Revenue Creator','Create revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.creator', false),
  ('Revenue Editor','Edit revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.editor', false),
  ('Revenue Viewer','Read-only access to revenue.','#22C55E', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'revenue.viewer', true),
  -- Tenant Issue
  ('Tenant Issue Admin','Full control over tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.admin', false),
  ('Tenant Issue Creator','Create tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.creator', false),
  ('Tenant Issue Editor','Edit tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.editor', false),
  ('Tenant Issue Viewer','Read-only access to tenant issues.','#F97316', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_issue.viewer', false),
  -- Tenant Tier
  ('Tenant Tier Admin','Full control over tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.admin', false),
  ('Tenant Tier Creator','Create tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.creator', false),
  ('Tenant Tier Editor','Edit tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.editor', false),
  ('Tenant Tier Viewer','Read-only access to tenant tiers.','#D946EF', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'tenant_tier.viewer', false),
  -- Track
  ('Track Admin','Full control over tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.admin', false),
  ('Track Creator','Create tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.creator', false),
  ('Track Editor','Edit tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.editor', false),
  ('Track Viewer','Read-only access to tracks.','#10B981', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'track.viewer', true),
  -- User
  ('User Admin','Full control over users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.admin', false),
  ('User Creator','Create users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.creator', false),
  ('User Editor','Edit users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.editor', false),
  ('User Viewer','Read-only access to users.','#6366F1', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'user.viewer', true),
  -- Workspace
  ('Workspace Admin','Full control over workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.admin', false),
  ('Workspace Creator','Create workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.creator', false),
  ('Workspace Editor','Edit workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.editor', false),
  ('Workspace Viewer','Read-only access to workspaces.','#14B8A6', '8554043d-a902-43fe-b4c4-40a22b93dfe2', '8554043d-a902-43fe-b4c4-40a22b93dfe2', 'workspace.viewer', true)
ON CONFLICT ("name") DO UPDATE SET
  note  = EXCLUDED.note,
  color = EXCLUDED.color,
  is_default = EXCLUDED.is_default;