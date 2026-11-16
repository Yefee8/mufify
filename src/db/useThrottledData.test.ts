import { act, renderHook } from '@testing-library/react-native';

import { useThrottledData } from './useThrottledData';

interface Props {
  value: number[];
}

describe('useThrottledData', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes the first real value at once, however soon after mount it lands', async () => {
    // A screen's live query starts empty and its result arrives a moment later.
    const rows = [1, 2, 3];
    const { result, rerender } = await renderHook(({ value }: Props) => useThrottledData(value), {
      initialProps: { value: [] },
    });

    await rerender({ value: rows });

    expect(result.current).toBe(rows);
  });

  it('holds a burst of later values to one per interval, ending on the latest', async () => {
    const first = [1];
    const { result, rerender } = await renderHook(
      ({ value }: Props) => useThrottledData(value, 500),
      { initialProps: { value: [] } },
    );
    await rerender({ value: first });
    expect(result.current).toBe(first);

    const second = [1, 2];
    const third = [1, 2, 3];
    await rerender({ value: second });
    await rerender({ value: third });
    expect(result.current).toBe(first);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe(third);
  });
});
