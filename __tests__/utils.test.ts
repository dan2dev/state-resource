import { describe, it, expect } from 'vitest';
import { stableKey } from '../src/utils';

describe('stableKey', () => {
  // ── Basic primitives ──────────────────────────────────────────────

  it('serialises an empty array', () => {
    expect(stableKey([])).toBe('[]');
  });

  it('serialises string args', () => {
    expect(stableKey(['hello'])).toBe('["hello"]');
  });

  it('serialises number args', () => {
    expect(stableKey([1, 2, 3])).toBe('[1,2,3]');
  });

  it('serialises boolean args', () => {
    expect(stableKey([true, false])).toBe('[true,false]');
  });

  it('serialises null', () => {
    expect(stableKey([null])).toBe('[null]');
  });

  it('serialises undefined (becomes null in JSON)', () => {
    expect(stableKey([undefined])).toBe('[null]');
  });

  it('serialises mixed primitives', () => {
    expect(stableKey([1, 'two', true, null])).toBe('[1,"two",true,null]');
  });

  // ── Object key ordering ───────────────────────────────────────────

  it('produces the same key regardless of object key order', () => {
    const a = stableKey([{ a: 1, b: 2 }]);
    const b = stableKey([{ b: 2, a: 1 }]);
    expect(a).toBe(b);
  });

  it('sorts keys alphabetically in the output', () => {
    const key = stableKey([{ z: 1, a: 2 }]);
    expect(key).toBe('[{"a":2,"z":1}]');
  });

  it('handles deeply nested objects with different key orders', () => {
    const a = stableKey([{ outer: { b: 2, a: 1 } }]);
    const b = stableKey([{ outer: { a: 1, b: 2 } }]);
    expect(a).toBe(b);
  });

  it('handles three-level deep nested objects', () => {
    const a = stableKey([{ l1: { l2: { c: 3, a: 1, b: 2 } } }]);
    const b = stableKey([{ l1: { l2: { a: 1, b: 2, c: 3 } } }]);
    expect(a).toBe(b);
  });

  // ── Arrays (order-sensitive) ──────────────────────────────────────

  it('does NOT sort array elements (arrays are order-sensitive)', () => {
    const a = stableKey([[1, 2, 3]]);
    const b = stableKey([[3, 2, 1]]);
    expect(a).not.toBe(b);
  });

  it('preserves array element order inside objects', () => {
    const key = stableKey([{ items: [3, 1, 2] }]);
    expect(key).toBe('[{"items":[3,1,2]}]');
  });

  it('handles arrays of objects with varying key orders', () => {
    const a = stableKey([[{ b: 2, a: 1 }, { d: 4, c: 3 }]]);
    const b = stableKey([[{ a: 1, b: 2 }, { c: 3, d: 4 }]]);
    expect(a).toBe(b);
  });

  // ── Special JSON values ───────────────────────────────────────────

  it('serialises NaN as null (JSON behaviour)', () => {
    expect(stableKey([NaN])).toBe('[null]');
  });

  it('serialises Infinity as null (JSON behaviour)', () => {
    expect(stableKey([Infinity])).toBe('[null]');
  });

  it('serialises -Infinity as null (JSON behaviour)', () => {
    expect(stableKey([-Infinity])).toBe('[null]');
  });

  it('serialises 0 and -0 identically (JSON behaviour)', () => {
    expect(stableKey([0])).toBe(stableKey([-0]));
  });

  it('serialises empty string', () => {
    expect(stableKey([''])).toBe('[""]');
  });

  it('serialises empty object', () => {
    expect(stableKey([{}])).toBe('[{}]');
  });

  it('serialises empty nested array', () => {
    expect(stableKey([[]])).toBe('[[]]');
  });

  // ── Multiple args ─────────────────────────────────────────────────

  it('differentiates between different arg counts', () => {
    const a = stableKey([1]);
    const b = stableKey([1, undefined]);
    // [1] vs [1,null] — they differ
    expect(a).not.toBe(b);
  });

  it('produces same key for identical multi-arg calls', () => {
    const a = stableKey(['a', 42, { x: true }]);
    const b = stableKey(['a', 42, { x: true }]);
    expect(a).toBe(b);
  });

  it('differentiates args with different types but same string representation', () => {
    const a = stableKey([1]);
    const b = stableKey(['1']);
    expect(a).not.toBe(b);
  });

  it('differentiates null from undefined (both serialize to null in JSON)', () => {
    // This is a known JSON limitation — both become null
    const a = stableKey([null]);
    const b = stableKey([undefined]);
    expect(a).toBe(b); // both are '[null]'
  });

  // ── Complex / real-world shaped args ──────────────────────────────

  it('handles a realistic filter object', () => {
    const filter1 = { page: 1, sort: 'name', filters: { active: true, role: 'admin' } };
    const filter2 = { filters: { role: 'admin', active: true }, sort: 'name', page: 1 };
    expect(stableKey([filter1])).toBe(stableKey([filter2]));
  });

  it('handles nested arrays inside objects inside arrays', () => {
    const arg = [{ tags: ['a', 'b'], meta: { ids: [1, 2] } }];
    const key = stableKey(arg);
    expect(key).toBe('[{"meta":{"ids":[1,2]},"tags":["a","b"]}]');
  });

  // ── Strings with special characters ───────────────────────────────

  it('handles strings with quotes and special chars', () => {
    const key = stableKey(['he said "hello"', 'line\nnewline']);
    expect(key).toBe('["he said \\"hello\\"","line\\nnewline"]');
  });

  it('handles unicode strings', () => {
    const key = stableKey(['日本語', '🎉']);
    expect(key).toBe('["日本語","🎉"]');
  });
});
