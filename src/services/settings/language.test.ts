import { resolveLanguage } from './language';

describe('resolveLanguage', () => {
  it('honours an explicit choice over the device locale', () => {
    expect(resolveLanguage('tr', ['en-US'])).toBe('tr');
    expect(resolveLanguage('en', ['tr-TR'])).toBe('en');
  });

  it('follows the device when set to system', () => {
    expect(resolveLanguage('system', ['tr-TR'])).toBe('tr');
    expect(resolveLanguage('system', ['en-GB'])).toBe('en');
  });

  it('ignores the region and matches on the base tag', () => {
    expect(resolveLanguage('system', ['tr-CY'])).toBe('tr');
    expect(resolveLanguage('system', ['TR'])).toBe('tr');
  });

  it('walks the preference list until it finds a language we ship', () => {
    expect(resolveLanguage('system', ['de-DE', 'fr-FR', 'tr-TR'])).toBe('tr');
  });

  it('falls back to English when nothing matches', () => {
    expect(resolveLanguage('system', ['de-DE'])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });
});
