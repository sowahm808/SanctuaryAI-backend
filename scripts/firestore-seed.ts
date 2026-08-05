import { CampaignStatus, ContentStatus, MembershipStatus, OrganizationStatus, UserStatus } from '../src/database/firestore';

export const defaultPermissions = [
  'organizations.read','organizations.write','memberships.manage','roles.manage','churchProfile.write','brandKit.write','campaigns.write','themes.write','sermons.write','prayers.write','declarations.write','media.write','approvals.review','social.publish','audit.read','settings.manage',
] as const;

export const defaultRoles = [
  { systemKey: 'SuperAdministrator', permissions: [...defaultPermissions] },
  { systemKey: 'ChurchAdministrator', permissions: defaultPermissions.filter((p) => p !== 'settings.manage') },
  { systemKey: 'SeniorPastor', permissions: ['organizations.read','campaigns.write','themes.write','sermons.write','prayers.write','declarations.write','approvals.review'] },
  { systemKey: 'AssociatePastor', permissions: ['organizations.read','themes.write','sermons.write','prayers.write','declarations.write'] },
  { systemKey: 'ContentWriter', permissions: ['organizations.read','themes.write','sermons.write','prayers.write','declarations.write'] },
  { systemKey: 'MediaTeam', permissions: ['organizations.read','media.write','brandKit.write'] },
  { systemKey: 'Reviewer', permissions: ['organizations.read','approvals.review'] },
  { systemKey: 'Publisher', permissions: ['organizations.read','social.publish'] },
  { systemKey: 'Viewer', permissions: ['organizations.read'] },
] as const;

export const developmentSuperAdmin = {
  id: '00000000-0000-4000-8000-000000000001',
  email: process.env.DEV_SUPER_ADMIN_EMAIL ?? 'dev-super-admin@example.invalid',
  displayName: 'Development Super Administrator',
  status: UserStatus.Active,
};

export const sampleSeed = {
  organization: { id: '00000000-0000-4000-8000-000000000101', name: 'Sanctuary Sample Church', slug: 'sanctuary-sample', status: OrganizationStatus.Active },
  membership: { id: '00000000-0000-4000-8000-000000000201', organizationId: '00000000-0000-4000-8000-000000000101', userId: developmentSuperAdmin.id, status: MembershipStatus.Active },
  churchProfile: { id: '00000000-0000-4000-8000-000000000301', organizationId: '00000000-0000-4000-8000-000000000101', mission: 'Equip the church with faithful weekly ministry content.', timezone: 'America/New_York', primaryLanguage: 'en' },
  brandKit: { id: '00000000-0000-4000-8000-000000000401', organizationId: '00000000-0000-4000-8000-000000000101', colorPalette: ['#1E3A8A', '#F59E0B'], fontFamilies: ['Inter', 'Merriweather'] },
  campaign: { id: '00000000-0000-4000-8000-000000000501', organizationId: '00000000-0000-4000-8000-000000000101', name: 'January Renewal', month: 1, year: 2027, status: CampaignStatus.Draft },
  theme: { id: '00000000-0000-4000-8000-000000000601', organizationId: '00000000-0000-4000-8000-000000000101', campaignId: '00000000-0000-4000-8000-000000000501', title: 'Renewed in Christ', status: ContentStatus.Draft, sequence: 1 },
  sermon: { id: '00000000-0000-4000-8000-000000000701', organizationId: '00000000-0000-4000-8000-000000000101', campaignId: '00000000-0000-4000-8000-000000000501', title: 'A New Heart', status: ContentStatus.Draft },
  prayerCollection: { id: '00000000-0000-4000-8000-000000000801', organizationId: '00000000-0000-4000-8000-000000000101', campaignId: '00000000-0000-4000-8000-000000000501', title: 'Renewal Prayers', status: ContentStatus.Draft },
  declaration: { id: '00000000-0000-4000-8000-000000000901', organizationId: '00000000-0000-4000-8000-000000000101', campaignId: '00000000-0000-4000-8000-000000000501', text: 'We walk in renewal and obedience to Christ.', status: ContentStatus.Draft },
} as const;
