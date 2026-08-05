const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, fieldName = 'id'): void {
  if (!uuidPattern.test(value)) throw new Error(`${fieldName} must be a UUID`);
}
export function assertMonth(month: number): void { if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('month must be 1-12'); }
export function assertYear(year: number): void { if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year must be 2000-2100'); }
export function assertPercentage(value: number, fieldName = 'percentage'): void { if (value < 0 || value > 100) throw new Error(`${fieldName} must be 0-100`); }
export function assertPositiveSequence(value: number, fieldName = 'sequence'): void { if (!Number.isInteger(value) || value < 1) throw new Error(`${fieldName} must be a positive integer`); }
export function assertPositiveDuration(seconds: number, fieldName = 'durationSeconds'): void { if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${fieldName} must be positive`); }
export function assertAttempts(value: number, max = 10): void { if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`attempts must be 0-${max}`); }
export function assertVersion(value: number): void { if (!Number.isInteger(value) || value < 1) throw new Error('version must be a positive integer'); }
export function campaignUniquenessId(organizationId: string, year: number, month: number): string { assertUuid(organizationId, 'organizationId'); assertYear(year); assertMonth(month); return `${organizationId}_${year}_${String(month).padStart(2, '0')}`; }
