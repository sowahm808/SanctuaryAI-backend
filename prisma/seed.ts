import { PrismaClient, UserStatus } from '@prisma/client';
import { argon2id, hash } from 'argon2';

const db = new PrismaClient();

const ids = {
  organization: '10000000-0000-4000-8000-000000000001',
  churchProfile: '10000000-0000-4000-8000-000000000002',
  brandKit: '10000000-0000-4000-8000-000000000003',
  campaign: '10000000-0000-4000-8000-000000000004',
  theme: '10000000-0000-4000-8000-000000000005',
  sermon: '10000000-0000-4000-8000-000000000006',
  prayerCollection: '10000000-0000-4000-8000-000000000007',
  prayerPoint: '10000000-0000-4000-8000-000000000008',
  declaration: '10000000-0000-4000-8000-000000000009',
  seedAuthor: '10000000-0000-4000-8000-000000000010',
  superRole: '10000000-0000-4000-8000-000000000011',
} as const;

const permissions = [
  'organizations.manage', 'members.read', 'members.invite', 'members.manage',
  'roles.read', 'roles.manage', 'church-profile.read', 'church-profile.update',
  'brand-kit.read', 'brand-kit.update', 'campaigns.create', 'campaigns.read',
  'campaigns.update', 'campaigns.delete', 'themes.create', 'themes.read',
  'themes.update', 'themes.approve', 'sermons.create', 'sermons.read',
  'sermons.update', 'sermons.approve', 'sermons.publish', 'prayers.create',
  'prayers.read', 'prayers.update', 'declarations.create', 'declarations.read',
  'declarations.update', 'media.create', 'media.read', 'media.update',
  'media.delete', 'flyers.create', 'flyers.read', 'flyers.update',
  'videos.create', 'videos.read', 'videos.update', 'approvals.read',
  'approvals.review', 'social-accounts.manage', 'social-posts.create',
  'social-posts.read', 'social-posts.schedule', 'social-posts.publish',
  'knowledge.manage', 'knowledge.read', 'analytics.read', 'audit-logs.read',
  'settings.manage',
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  SuperAdministrator: permissions,
  ChurchAdministrator: permissions.filter((code) => code !== 'settings.manage'),
  SeniorPastor: permissions.filter((code) => !code.startsWith('social-accounts') && code !== 'settings.manage'),
  AssociatePastor: permissions.filter((code) => /^(campaigns|themes|sermons|prayers|declarations|approvals)\./.test(code)),
  ContentWriter: permissions.filter((code) => /^(campaigns|themes|sermons|prayers|declarations)\.(create|read|update)$/.test(code)),
  MediaTeam: permissions.filter((code) => /^(media|flyers|videos)\./.test(code)),
  Reviewer: permissions.filter((code) => code.endsWith('.read') || code === 'approvals.review'),
  Publisher: permissions.filter((code) => code.endsWith('.read') || /^(sermons|social-posts)\.publish$/.test(code)),
  Viewer: permissions.filter((code) => code.endsWith('.read') && code !== 'audit-logs.read'),
};

async function seedPermissionsAndRoles() {
  for (const code of permissions) {
    await db.permission.upsert({
      where: { code },
      update: { description: code.replaceAll('.', ' ') },
      create: { code, description: code.replaceAll('.', ' ') },
    });
  }

  const permissionRows = await db.permission.findMany();
  const permissionByCode = new Map(permissionRows.map((permission) => [permission.code, permission.id]));
  for (const [index, [name, codes]] of Object.entries(rolePermissions).entries()) {
    const roleId = name === 'SuperAdministrator'
      ? ids.superRole
      : `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const role = await db.role.upsert({
      where: { id: roleId },
      update: { name, description: `Default ${name} role`, isSystemRole: true },
      create: { id: roleId, name, description: `Default ${name} role`, isSystemRole: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: codes.map((code) => ({ roleId: role.id, permissionId: permissionByCode.get(code)! })),
    });
  }
}

async function seedSampleData() {
  const author = await db.user.upsert({
    where: { id: ids.seedAuthor },
    update: { displayName: 'SanctuaryAI Seed Author' },
    create: {
      id: ids.seedAuthor,
      email: 'seed-author@sanctuaryai.invalid',
      normalizedEmail: 'seed-author@sanctuaryai.invalid',
      passwordHash: 'SEED_ACCOUNT_CANNOT_AUTHENTICATE',
      displayName: 'SanctuaryAI Seed Author',
      status: UserStatus.DISABLED,
    },
  });
  const organization = await db.organization.upsert({
    where: { id: ids.organization },
    update: { name: 'Sanctuary Community Church' },
    create: { id: ids.organization, name: 'Sanctuary Community Church', slug: 'sanctuary-community-church', timezone: 'UTC' },
  });
  await db.churchProfile.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { id: ids.churchProfile, organizationId: organization.id, churchName: organization.name, preferredBibleTranslation: 'NIV', ministryTone: 'Hopeful, pastoral, and scripture-centered' },
  });
  await db.brandKit.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { id: ids.brandKit, organizationId: organization.id, primaryColor: '#392B58', secondaryColor: '#E2B855', headingFont: 'Montserrat', bodyFont: 'Inter' },
  });
  const campaign = await db.monthlyCampaign.upsert({
    where: { id: ids.campaign },
    update: {},
    create: { id: ids.campaign, organizationId: organization.id, month: 1, year: 2027, title: 'A New Beginning', mainScripture: 'Isaiah 43:19', createdById: author.id },
  });
  await db.monthlyTheme.upsert({
    where: { id: ids.theme },
    update: {},
    create: { id: ids.theme, organizationId: organization.id, campaignId: campaign.id, title: 'Behold, I Am Doing a New Thing', mainScripture: 'Isaiah 43:19', contentJson: { objective: 'Recognize and participate in God’s renewing work.' }, createdById: author.id },
  });
  await db.sermon.upsert({
    where: { id: ids.sermon },
    update: {},
    create: { id: ids.sermon, organizationId: organization.id, campaignId: campaign.id, title: 'Stepping Into the New', contentJson: { outline: ['Release the past', 'Perceive the new', 'Walk by faith'] }, targetDurationMinutes: 35, createdById: author.id },
  });
  const collection = await db.prayerCollection.upsert({
    where: { id: ids.prayerCollection },
    update: {},
    create: { id: ids.prayerCollection, organizationId: organization.id, campaignId: campaign.id, title: 'Prayers for New Beginnings', createdById: author.id },
  });
  await db.prayerPoint.upsert({
    where: { id: ids.prayerPoint },
    update: {},
    create: { id: ids.prayerPoint, organizationId: organization.id, collectionId: collection.id, sequence: 1, text: 'Lord, give us faith to follow where You lead.', scripture: 'Isaiah 43:19' },
  });
  await db.propheticDeclaration.upsert({
    where: { id: ids.declaration },
    update: {},
    create: { id: ids.declaration, organizationId: organization.id, campaignId: campaign.id, title: 'God Is Making a Way', text: 'We declare that God is making a way in the wilderness and streams in the wasteland.', scripture: 'Isaiah 43:19', createdById: author.id },
  });
}

async function seedDevelopmentAdministrator() {
  const email = process.env.DEV_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEV_SUPER_ADMIN_PASSWORD;
  if (!email) return;
  if (process.env.NODE_ENV === 'production') throw new Error('Development administrator seeding is disabled in production');
  if (!password || password.length < 12) throw new Error('DEV_SUPER_ADMIN_PASSWORD must contain at least 12 characters');
  const passwordHash = await hash(password, { type: argon2id });
  const user = await db.user.upsert({
    where: { normalizedEmail: email },
    update: { passwordHash, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    create: { email, normalizedEmail: email, passwordHash, displayName: 'Development Super Administrator', status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
  });
  await db.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: ids.organization } },
    update: { roleId: ids.superRole, status: 'ACTIVE', joinedAt: new Date() },
    create: { userId: user.id, organizationId: ids.organization, roleId: ids.superRole, status: 'ACTIVE', joinedAt: new Date() },
  });
}

async function main() {
  await seedPermissionsAndRoles();
  await seedSampleData();
  await seedDevelopmentAdministrator();
}

void main().finally(async () => db.$disconnect());
