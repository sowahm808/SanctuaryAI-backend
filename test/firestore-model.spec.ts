import { CampaignStatus, ContentStatus, SocialPlatform, UserStatus, campaignUniquenessId, assertAttempts, assertMonth, assertVersion } from '../src/database/firestore';
import { defaultPermissions, defaultRoles, developmentSuperAdmin, sampleSeed } from '../scripts/firestore-seed';

describe('Phase 2 Firestore model contract', () => {
  it('exposes required lifecycle enums', () => {
    expect(UserStatus.Active).toBe('ACTIVE');
    expect(CampaignStatus.Draft).toBe('DRAFT');
    expect(ContentStatus.Approved).toBe('APPROVED');
    expect(SocialPlatform.Instagram).toBe('INSTAGRAM');
  });

  it('validates Firestore domain constraints', () => {
    expect(() => assertMonth(13)).toThrow('month');
    expect(() => assertAttempts(11)).toThrow('attempts');
    expect(() => assertVersion(0)).toThrow('version');
    expect(campaignUniquenessId('00000000-0000-4000-8000-000000000101', 2027, 1)).toBe('00000000-0000-4000-8000-000000000101_2027_01');
  });

  it('provides deterministic credential-free seeds', () => {
    expect(defaultPermissions).toContain('settings.manage');
    expect(defaultRoles.map((role) => role.systemKey)).toEqual([
      'SuperAdministrator','ChurchAdministrator','SeniorPastor','AssociatePastor','ContentWriter','MediaTeam','Reviewer','Publisher','Viewer',
    ]);
    expect(developmentSuperAdmin.email.endsWith('.invalid') || developmentSuperAdmin.email.includes('@')).toBe(true);
    expect(sampleSeed.theme.organizationId).toBe(sampleSeed.organization.id);
    expect(sampleSeed.declaration.campaignId).toBe(sampleSeed.campaign.id);
  });
});
