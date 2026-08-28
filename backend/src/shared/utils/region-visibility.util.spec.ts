import { Role } from '../enums/roles.enum';
import {
  effectiveRegionCodes,
  isAdminRole,
  scopedRegionCodes,
  seesAllRegions,
} from './region-visibility.util';

describe('region-visibility.util', () => {
  describe('seesAllRegions', () => {
    it('grants every region to the company owner roles', () => {
      expect(seesAllRegions(Role.SUPER_ADMIN)).toBe(true);
      expect(seesAllRegions(Role.COMPANY_ADMIN)).toBe(true);
    });

    it('confines ADMIN to the regions assigned to them', () => {
      expect(seesAllRegions(Role.ADMIN)).toBe(false);
      expect(
        scopedRegionCodes({ role: Role.ADMIN, regionCodes: ['AE-DU'] }),
      ).toEqual(['AE-DU']);
    });

    it('keeps ADMIN an admin for non-region privileges', () => {
      expect(isAdminRole(Role.ADMIN)).toBe(true);
      expect(isAdminRole(Role.COMPANY_ADMIN)).toBe(true);
      expect(isAdminRole(Role.SUPER_ADMIN)).toBe(true);
      expect(isAdminRole(Role.AGENT)).toBe(false);
      expect(isAdminRole(Role.MANAGER)).toBe(false);
    });

    it('does not grant every region to an agent', () => {
      expect(seesAllRegions(Role.AGENT)).toBe(false);
    });
  });

  describe('scopedRegionCodes', () => {
    it('returns null when there is no caller', () => {
      expect(scopedRegionCodes(undefined)).toBeNull();
    });

    it('returns null for an admin role', () => {
      expect(
        scopedRegionCodes({ role: Role.COMPANY_ADMIN, regionCodes: ['AE-DU'] }),
      ).toBeNull();
    });

    it('returns the assignments for a confined caller', () => {
      expect(
        scopedRegionCodes({
          role: Role.AGENT,
          regionCodes: ['AE-DU', 'AE-AZ'],
        }),
      ).toEqual(['AE-DU', 'AE-AZ']);
    });

    it('returns an empty array for a confined caller with no assignments', () => {
      expect(scopedRegionCodes({ role: Role.AGENT, regionCodes: [] })).toEqual(
        [],
      );
    });

    it('returns an empty array when a confined caller has no regionCodes', () => {
      expect(
        scopedRegionCodes({
          role: Role.AGENT,
          regionCodes: undefined as unknown as string[],
        }),
      ).toEqual([]);
    });
  });

  describe('effectiveRegionCodes', () => {
    it('returns null when there is no caller and no requested region', () => {
      expect(effectiveRegionCodes(undefined, undefined)).toBeNull();
    });

    it('returns just the requested region for a company owner role', () => {
      expect(
        effectiveRegionCodes('AE-DU', {
          role: Role.COMPANY_ADMIN,
          regionCodes: [],
        }),
      ).toEqual(['AE-DU']);
    });

    it('returns null for a company owner role with no requested region', () => {
      expect(
        effectiveRegionCodes(undefined, {
          role: Role.COMPANY_ADMIN,
          regionCodes: ['AE-DU'],
        }),
      ).toBeNull();
    });

    it('confines ADMIN to their own regions, not the whole company', () => {
      expect(
        effectiveRegionCodes(undefined, {
          role: Role.ADMIN,
          regionCodes: ['AE-DU', 'AE-SH'],
        }),
      ).toEqual(['AE-DU', 'AE-SH']);
      expect(
        effectiveRegionCodes('AE-AZ', {
          role: Role.ADMIN,
          regionCodes: ['AE-DU'],
        }),
      ).toEqual([]);
    });

    it('returns every assignment for a confined caller with no requested region', () => {
      expect(
        effectiveRegionCodes(undefined, {
          role: Role.AGENT,
          regionCodes: ['AE-DU', 'AE-AZ'],
        }),
      ).toEqual(['AE-DU', 'AE-AZ']);
    });

    it('narrows a confined caller to the requested region', () => {
      expect(
        effectiveRegionCodes('AE-DU', {
          role: Role.AGENT,
          regionCodes: ['AE-DU', 'AE-AZ'],
        }),
      ).toEqual(['AE-DU']);
    });

    it('returns an empty array when the requested region is not held', () => {
      expect(
        effectiveRegionCodes('AE-SH', {
          role: Role.AGENT,
          regionCodes: ['AE-DU', 'AE-AZ'],
        }),
      ).toEqual([]);
    });

    it('returns an empty array for a confined caller with no assignments', () => {
      expect(
        effectiveRegionCodes('AE-DU', { role: Role.AGENT, regionCodes: [] }),
      ).toEqual([]);
    });
  });
});
