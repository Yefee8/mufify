import { permissionErrorFor } from './permission';

describe('permissionErrorFor', () => {
  it('lets the scan proceed once the permission is granted', () => {
    expect(permissionErrorFor({ granted: true, canAskAgain: true })).toBeNull();
  });

  it('still proceeds when granted and the platform will not ask again', () => {
    // Granted is granted — `canAskAgain` is only meaningful for a denial, and
    // reading it first would block a scan that is perfectly allowed to run.
    expect(permissionErrorFor({ granted: false, canAskAgain: true })).not.toBeNull();
    expect(permissionErrorFor({ granted: true, canAskAgain: false })).toBeNull();
  });

  it('reports an ordinary denial as retryable', () => {
    expect(permissionErrorFor({ granted: false, canAskAgain: true })).toBe('permission-denied');
  });

  it('reports a permanent denial separately, because retrying cannot fix it', () => {
    expect(permissionErrorFor({ granted: false, canAskAgain: false })).toBe('permission-blocked');
  });
});
