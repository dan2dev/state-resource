import { describe, it, expect, vi } from 'vitest';
import { createQuery, invalidate } from './index';

describe('createQuery', () => {
  it('returns same promise for same args', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t1', fn);
    expect(query('a')).toBe(query('a'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns different promise for different args', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t2', fn);
    expect(query('a')).not.toBe(query('b'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stable key regardless of object key order', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t3', (filter: { a?: number; b?: string }) => fn(filter));
    const p1 = query({ a: 1, b: 'x' });
    const p2 = query({ b: 'x', a: 1 });
    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invalidate refetches immediately and caches the new promise', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t4', fn);
    query('a');                    // call 1: initial fetch
    query.invalidate('a');         // call 2: refetch
    expect(query('a')).toBe(query('a')); // returns the refetched promise, no new call
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clear removes all cached entries without refetching', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t5', fn);
    query('a');
    query('b');
    query.clear();
    query('a');  // call 3: fresh fetch after clear
    query('b');  // call 4: fresh fetch after clear
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('global invalidate refetches all entries for a cacheId', () => {
    const fn = vi.fn().mockResolvedValue('data');
    const query = createQuery('t6', fn);
    query('a');        // call 1
    query('b');        // call 2
    invalidate('t6');  // calls 3 & 4: refetches both
    query('a');        // returns refetched promise, no new call
    query('b');        // returns refetched promise, no new call
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('retries after rejection', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      return calls === 1 ? Promise.reject(new Error('fail')) : Promise.resolve('ok');
    });
    const query = createQuery('t7', fn);
    await expect(query('a')).rejects.toThrow('fail');
    await new Promise((r) => setTimeout(r, 0));
    await expect(query('a')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exposes cacheId', () => {
    const query = createQuery('my-id', vi.fn());
    expect(query.cacheId).toBe('my-id');
  });
});
