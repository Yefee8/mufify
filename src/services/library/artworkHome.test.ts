import { fileNameOf, planRelocation } from './artworkHome';

const HOME = '/data/user/0/dev.mufify.app/files/artwork';
const CACHE = '/data/user/0/dev.mufify.app/cache/artwork';

describe('planRelocation', () => {
  it('moves a cover whose file is still in the cache', () => {
    const plan = planRelocation([`${CACHE}/ab12-512.jpg`], HOME, () => true);

    expect([...plan.moves]).toEqual([[`${CACHE}/ab12-512.jpg`, `${HOME}/ab12-512.jpg`]]);
    expect(plan.lost).toEqual([]);
  });

  it('sends a cover the system already deleted back through the scan', () => {
    const plan = planRelocation([`${CACHE}/gone-512.jpg`], HOME, () => false);

    expect(plan.moves.size).toBe(0);
    expect(plan.lost).toEqual([`${CACHE}/gone-512.jpg`]);
  });

  it('leaves covers that are already at home alone, and never asks about them', () => {
    const exists = jest.fn(() => false);
    const plan = planRelocation([`${HOME}/ok-512.jpg`, `${HOME}/also-512.jpg`], HOME, exists);

    expect(plan.moves.size).toBe(0);
    expect(plan.lost).toEqual([]);
    expect(exists).not.toHaveBeenCalled();
  });

  it('asks once per distinct path — an album shares one file', () => {
    const exists = jest.fn(() => true);
    const path = `${CACHE}/album-512.jpg`;
    planRelocation([path, path, path], HOME, exists);

    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('does not mistake a sibling directory for home', () => {
    const sibling = `${HOME}-old/x-512.jpg`;
    const plan = planRelocation([sibling], `${HOME}/`, () => true);

    expect(plan.moves.get(sibling)).toBe(`${HOME}/x-512.jpg`);
  });
});

describe('fileNameOf', () => {
  it('takes what follows the last slash', () => {
    expect(fileNameOf('/a/b/c.jpg')).toBe('c.jpg');
    expect(fileNameOf('c.jpg')).toBe('c.jpg');
  });
});
