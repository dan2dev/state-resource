import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuery, createQuery, invalidate } from '../src/index';

// Helper: create a controllable promise
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Each test gets a fresh cacheId to avoid cross-test cache pollution
let nextId = 0;
function uid() {
  return `test-useQuery-${nextId++}`;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// Basic state transitions
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – state transitions', () => {
  it('starts in loading state', () => {
    const query = createQuery(uid(), (_x: string) => new Promise<string>(() => {}));
    const { result } = renderHook(() => useQuery(query, ['a']));

    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('transitions to ok state when fetch resolves', async () => {
    const query = createQuery(uid(), async (x: string) => `hello ${x}`);
    const { result } = renderHook(() => useQuery(query, ['world']));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(result.current.data).toBe('hello world');
    expect(result.current.error).toBeUndefined();
  });

  it('transitions to error state when fetch rejects with Error', async () => {
    const query = createQuery(uid(), async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('boom');
    expect(result.current.data).toBeUndefined();
  });

  it('wraps non-Error rejections in an Error', async () => {
    const query = createQuery(uid(), async () => {
      throw 'string-error'; // eslint-disable-line no-throw-literal
    });
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('string-error');
  });

  it('wraps numeric rejection in an Error', async () => {
    const query = createQuery(uid(), async () => {
      throw 42; // eslint-disable-line no-throw-literal
    });
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('42');
  });

  it('wraps null rejection in an Error', async () => {
    const query = createQuery(uid(), async () => {
      throw null; // eslint-disable-line no-throw-literal
    });
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('null');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Args changes & refetching
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – args changes', () => {
  it('refetches when args change', async () => {
    const fn = vi.fn(async (x: string) => `result-${x}`);
    const query = createQuery(uid(), fn);

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => useQuery(query, args),
      { initialProps: { args: ['a'] as [string] } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('result-a');

    rerender({ args: ['b'] });

    await waitFor(() => {
      expect(result.current.data).toBe('result-b');
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('preserves stale data during re-fetch (loading with previous data)', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    let callCount = 0;

    const query = createQuery(uid(), async (_x: string) => {
      callCount++;
      if (callCount === 1) return d1.promise;
      return d2.promise;
    });

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => useQuery(query, args),
      { initialProps: { args: ['a'] as [string] } },
    );

    act(() => d1.resolve('data-a'));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-a');

    // Change args → triggers re-fetch
    rerender({ args: ['b'] });

    await waitFor(() => {
      expect(result.current.status).toBe('loading');
    });
    expect(result.current.data).toBe('data-a'); // stale data preserved

    act(() => d2.resolve('data-b'));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-b');
  });

  it('does not refetch when object args have same values but different key order', async () => {
    const fn = vi.fn(async (filter: { a: number; b: string }) => `${filter.a}-${filter.b}`);
    const query = createQuery(uid(), fn);

    const { result, rerender } = renderHook(
      ({ args }: { args: [{ a: number; b: string }] }) => useQuery(query, args),
      { initialProps: { args: [{ a: 1, b: 'x' }] as [{ a: number; b: string }] } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    rerender({ args: [{ b: 'x', a: 1 }] });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('1-x');
  });

  it('handles rapid arg changes (only latest result applies)', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const d3 = deferred<string>();
    let callCount = 0;

    const query = createQuery(uid(), async (_x: string) => {
      callCount++;
      if (callCount === 1) return d1.promise;
      if (callCount === 2) return d2.promise;
      return d3.promise;
    });

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => useQuery(query, args),
      { initialProps: { args: ['a'] as [string] } },
    );

    rerender({ args: ['b'] });
    rerender({ args: ['c'] });

    // Resolve the latest one
    act(() => d3.resolve('data-c'));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-c');

    // Resolve stale ones — should not override
    act(() => {
      d1.resolve('data-a-stale');
      d2.resolve('data-b-stale');
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.data).toBe('data-c');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation (ignores stale fetches)
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – cancellation / stale fetch', () => {
  it('ignores result from outdated fetch when args change', async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    let callCount = 0;

    const query = createQuery(uid(), async (_x: string) => {
      callCount++;
      if (callCount === 1) return d1.promise;
      return d2.promise;
    });

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => useQuery(query, args),
      { initialProps: { args: ['a'] as [string] } },
    );

    rerender({ args: ['b'] });

    act(() => d2.resolve('data-b'));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-b');

    // Resolve stale request
    act(() => d1.resolve('data-a-stale'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.data).toBe('data-b');
  });

  it('does not update state after unmount (no leaked setState)', async () => {
    const d = deferred<string>();
    const query = createQuery(uid(), async () => d.promise);

    const { result, unmount } = renderHook(() => useQuery(query, []));

    expect(result.current.status).toBe('loading');

    unmount();

    act(() => d.resolve('data'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.status).toBe('loading');
  });

  it('does not update state after unmount on rejection', async () => {
    const d = deferred<string>();
    const query = createQuery(uid(), async () => d.promise);

    const { result, unmount } = renderHook(() => useQuery(query, []));
    unmount();

    act(() => d.reject(new Error('after-unmount')));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.status).toBe('loading');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Refresh
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – refresh', () => {
  it('refresh triggers invalidation and re-fetch', async () => {
    let callCount = 0;
    const query = createQuery(uid(), async (_x: string) => {
      callCount++;
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useQuery(query, ['a']));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-1');

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.data).toBe('data-2');
    });
    expect(callCount).toBe(2);
  });

  it('refresh returns a stable function reference for same args', async () => {
    const query = createQuery(uid(), async (x: string) => x);

    const refreshes: (() => void)[] = [];

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => {
        const r = useQuery(query, args);
        refreshes.push(r.refresh);
        return r;
      },
      { initialProps: { args: ['a'] as [string] } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    rerender({ args: ['a'] });

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(refreshes.length).toBeGreaterThanOrEqual(2);
    expect(refreshes[0]).toBe(refreshes[1]);
  });

  it('refresh changes reference when args change', async () => {
    const query = createQuery(uid(), async (x: string) => x);

    const refreshes: (() => void)[] = [];

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => {
        const r = useQuery(query, args);
        refreshes.push(r.refresh);
        return r;
      },
      { initialProps: { args: ['a'] as [string] } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    rerender({ args: ['b'] });

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    // refresh reference should differ when args change
    const first = refreshes[0];
    const last = refreshes[refreshes.length - 1];
    expect(first).not.toBe(last);
  });

  it('handles multiple rapid refreshes', async () => {
    let callCount = 0;
    const query = createQuery(uid(), async () => {
      callCount++;
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-1');

    act(() => {
      result.current.refresh();
      result.current.refresh();
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.data).not.toBe('data-1');
    });

    expect(result.current.status).toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Global invalidate integration with useQuery
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – global invalidate', () => {
  it('global invalidate by cacheId string triggers re-fetch', async () => {
    const id = uid();
    let callCount = 0;
    const query = createQuery(id, async () => {
      callCount++;
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-1');

    act(() => {
      invalidate(id);
    });

    await waitFor(() => {
      expect(result.current.data).toBe('data-2');
    });
  });

  it('global invalidate by query object triggers re-fetch', async () => {
    let callCount = 0;
    const query = createQuery(uid(), async () => {
      callCount++;
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('data-1');

    act(() => {
      invalidate(query);
    });

    await waitFor(() => {
      expect(result.current.data).toBe('data-2');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Error recovery
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – error recovery', () => {
  it('can recover from error state via refresh', async () => {
    let callCount = 0;
    const query = createQuery(uid(), async () => {
      callCount++;
      if (callCount === 1) throw new Error('fail');
      return 'recovered';
    });

    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error!.message).toBe('fail');

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('recovered');
  });

  it('can recover from error state via args change', async () => {
    const query = createQuery(uid(), async (x: string) => {
      if (x === 'bad') throw new Error('bad input');
      return `ok-${x}`;
    });

    const { result, rerender } = renderHook(
      ({ args }: { args: [string] }) => useQuery(query, args),
      { initialProps: { args: ['bad'] as [string] } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    rerender({ args: ['good'] });

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('ok-good');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════
describe('useQuery – edge cases', () => {
  it('works with zero-arg queries', async () => {
    const query = createQuery(uid(), async () => 'no-args');
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('no-args');
  });

  it('works with multi-arg queries', async () => {
    const query = createQuery(uid(), async (a: string, b: number, c: boolean) => `${a}-${b}-${c}`);
    const { result } = renderHook(() => useQuery(query, ['x', 42, true]));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('x-42-true');
  });

  it('handles query that resolves with undefined', async () => {
    const query = createQuery(uid(), async () => undefined as unknown as string);
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBeUndefined();
  });

  it('handles query that resolves with null', async () => {
    const query = createQuery(uid(), async () => null as unknown as string);
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBeNull();
  });

  it('handles query that resolves with empty string', async () => {
    const query = createQuery(uid(), async () => '');
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe('');
  });

  it('handles query that resolves with 0', async () => {
    const query = createQuery(uid(), async () => 0);
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe(0);
  });

  it('handles query that resolves with false', async () => {
    const query = createQuery(uid(), async () => false);
    const { result } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });
    expect(result.current.data).toBe(false);
  });

  it('multiple hooks with the same query and args share the cache', async () => {
    const fn = vi.fn(async () => 'shared');
    const query = createQuery(uid(), fn);

    const { result: r1 } = renderHook(() => useQuery(query, []));
    const { result: r2 } = renderHook(() => useQuery(query, []));

    await waitFor(() => {
      expect(r1.current.status).toBe('ok');
    });
    await waitFor(() => {
      expect(r2.current.status).toBe('ok');
    });

    expect(r1.current.data).toBe('shared');
    expect(r2.current.data).toBe('shared');
    // The underlying fetch function is called only once (cache hit)
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not stay in loading when already has cached data from previous render', async () => {
    const query = createQuery(uid(), async (x: string) => `cached-${x}`);

    // First render populates cache
    const { result: r1, unmount } = renderHook(() => useQuery(query, ['a']));
    await waitFor(() => {
      expect(r1.current.status).toBe('ok');
    });
    unmount();

    // Second render should resolve immediately from cache
    const { result: r2 } = renderHook(() => useQuery(query, ['a']));
    await waitFor(() => {
      expect(r2.current.status).toBe('ok');
    });
    expect(r2.current.data).toBe('cached-a');
  });
});
