import { describe, it, expect, vi, beforeEach } from "vitest";
import { abort, createQuery, invalidate, subscribe } from "../src/query";

// Each test gets a fresh cacheId to avoid cross-test cache pollution
let nextId = 0;
function uid() {
  return `test-query-${nextId++}`;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// createQuery
// ═══════════════════════════════════════════════════════════════════
describe("createQuery", () => {
  // ── Caching ─────────────────────────────────────────────────────

  it("returns the same promise for the same args (cache hit)", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), fn);
    expect(query("a")).toBe(query("a"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns different promises for different args", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), fn);
    expect(query("a")).not.toBe(query("b"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caches based on stable key (object key order irrelevant)", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), (filter: { a?: number; b?: string }) =>
      fn(filter),
    );
    const p1 = query({ a: 1, b: "x" });
    const p2 = query({ b: "x", a: 1 });
    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caches across multiple args", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), (a: string, b: number) => fn(a, b));
    const p1 = query("x", 1);
    const p2 = query("x", 1);
    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("differentiates calls with different multi-arg values", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), (a: string, b: number) => fn(a, b));
    const p1 = query("x", 1);
    const p2 = query("x", 2);
    expect(p1).not.toBe(p2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── cacheId ─────────────────────────────────────────────────────

  it("exposes a readonly cacheId property", () => {
    const id = uid();
    const query = createQuery(id, vi.fn());
    expect(query.cacheId).toBe(id);
  });

  it("cacheId is not writable", () => {
    const query = createQuery(uid(), vi.fn());
    expect(() => {
      (query as unknown as Record<string, unknown>).cacheId = "nope";
    }).toThrow();
  });

  // ── invalidate (per-key) ────────────────────────────────────────

  it("invalidate refetches and caches the new promise", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), fn);
    query("a"); // call 1
    query.invalidate("a"); // call 2: refetch
    expect(query("a")).toBe(query("a")); // cached refetch
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("invalidate on a key that was never fetched creates a new entry", () => {
    const fn = vi.fn().mockResolvedValue("fresh");
    const query = createQuery(uid(), fn);
    query.invalidate("new-key");
    expect(fn).toHaveBeenCalledTimes(1);
    // The entry is now cached
    query("new-key");
    expect(fn).toHaveBeenCalledTimes(1); // still cached from invalidate
  });

  // ── AbortController ──────────────────────────────────────────────

  it("does not pass an AbortSignal to the query function", async () => {
    const fn = vi.fn((...args: [string, AbortSignal?]) =>
      Promise.resolve(args[1]),
    );
    const query = createQuery(uid(), fn);

    await expect(query("a")).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("query.abort(id) aborts the in-flight request and removes it from cache", async () => {
    const fn = vi.fn(() => new Promise<string>(() => undefined));
    const query = createQuery(uid(), (id: string) => {
      void id;
      return fn();
    });

    const p1 = query("a");
    query.abort("a");
    const p2 = query("a");

    expect(p2).not.toBe(p1);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
  });

  it("query.abort() aborts all in-flight requests for the query", async () => {
    const fn = vi.fn(() => new Promise<string>(() => undefined));
    const query = createQuery(uid(), (id: string) => {
      void id;
      return fn();
    });

    const p1 = query("a");
    const p2 = query("b");
    query.abort();

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
  });

  it("query.abortAll() aborts all in-flight requests for the query", async () => {
    const fn = vi.fn(() => new Promise<string>(() => undefined));
    const query = createQuery(uid(), (id: string) => {
      void id;
      return fn();
    });

    const p1 = query("a");
    const p2 = query("b");
    query.abortAll();

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
  });

  it("abort(cacheId) aborts all in-flight requests for a cache ID", async () => {
    const id = uid();
    const query = createQuery(id, (key: string) => {
      void key;
      return new Promise<string>(() => undefined);
    });

    const p1 = query("a");
    const p2 = query("b");
    abort(id);

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
  });

  it("abort(cacheId, id) aborts one in-flight request for a cache ID", async () => {
    const id = uid();
    const query = createQuery(id, (key: string) => {
      void key;
      return new Promise<string>(() => undefined);
    });

    const p1 = query("a");
    const p2 = query("b");
    abort(id, "a");

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    expect(query("b")).toBe(p2);
  });

  it("invalidate aborts an older in-flight request for the same key", async () => {
    const fn = vi.fn(() => new Promise<string>(() => undefined));
    const query = createQuery(uid(), (id: string) => {
      void id;
      return fn();
    });

    const p1 = query("a");
    query.invalidate("a");

    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
  });

  // ── clear ───────────────────────────────────────────────────────

  it("clear removes all cached entries", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), fn);
    query("a");
    query("b");
    expect(fn).toHaveBeenCalledTimes(2);
    query.clear();
    query("a");
    query("b");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("clear does not throw on an empty cache", () => {
    const query = createQuery(uid(), vi.fn().mockResolvedValue("x"));
    expect(() => query.clear()).not.toThrow();
  });

  it("clear aborts all in-flight requests for the query", async () => {
    const query = createQuery(uid(), (id: string) => {
      void id;
      return new Promise<string>(() => undefined);
    });

    const p1 = query("a");
    const p2 = query("b");
    query.clear();

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
  });

  // ── Rejection behaviour ─────────────────────────────────────────

  it("clears cache entry on rejection so next call re-fetches", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("fail"))
        : Promise.resolve("ok");
    });
    const query = createQuery(uid(), fn);

    await expect(query("a")).rejects.toThrow("fail");
    // Allow microtask for catch handler
    await new Promise((r) => setTimeout(r, 0));
    await expect(query("a")).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not clear cache if a newer promise replaced an aborted one", async () => {
    const id = uid();
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("fail"));
      return Promise.resolve("ok");
    });
    const query = createQuery(id, fn);

    const p1 = query("a"); // call 1 — will be aborted by invalidate
    query.invalidate("a"); // call 2 — replaces cache entry immediately

    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((r) => setTimeout(r, 0));

    // The invalidated entry should still be cached (not wiped by p1's catch)
    const p3 = query("a");
    expect(fn).toHaveBeenCalledTimes(2); // no new call — still cached
    await expect(p3).resolves.toBe("ok");
  });

  it("handles non-Error rejection values", async () => {
    const query = createQuery(uid(), (a: string) =>
      Promise.reject(`${a}-error`),
    );
    await expect(query("a")).rejects.toBe("a-error");
  });

  // ── Concurrency: no args (zero-arg query) ──────────────────────

  it("works with zero-arg query functions", () => {
    const fn = vi.fn().mockResolvedValue(42);
    const query = createQuery(uid(), fn);
    const p1 = query();
    const p2 = query();
    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Multiple createQuery with same cacheId share cache maps ────

  it("two createQuery calls with same cacheId share the same cache", () => {
    const id = uid();
    const fn1 = vi.fn().mockResolvedValue("first");
    const fn2 = vi.fn().mockResolvedValue("second");

    const query1 = createQuery(id, fn1);
    const query2 = createQuery(id, fn2);

    const p = query1("a");
    expect(query2("a")).toBe(p); // shared cache
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// subscribe
// ═══════════════════════════════════════════════════════════════════
describe("subscribe", () => {
  it("listener is called when the key is notified via invalidate", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a"); // populate refetcher

    const listener = vi.fn();
    subscribe(id, '["a"]', listener);

    query.invalidate("a");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe prevents further notifications", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");

    const listener = vi.fn();
    const unsub = subscribe(id, '["a"]', listener);

    query.invalidate("a");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    query.invalidate("a");
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it("multiple listeners on the same key all fire", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");

    const l1 = vi.fn();
    const l2 = vi.fn();
    subscribe(id, '["a"]', l1);
    subscribe(id, '["a"]', l2);

    query.invalidate("a");
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it("listeners on different keys are independent", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");
    query("b");

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    subscribe(id, '["a"]', listenerA);
    subscribe(id, '["b"]', listenerB);

    query.invalidate("a");
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(0);
  });

  it("subscribe to a non-existing cacheId does not throw", () => {
    const listener = vi.fn();
    expect(() => subscribe("non-existent", '["x"]', listener)).not.toThrow();
  });

  it("unsubscribing the last listener cleans up internal maps", () => {
    const id = uid();
    const listener = vi.fn();
    const unsub = subscribe(id, '["a"]', listener);
    unsub();
    // Re-subscribing should work without issues
    const listener2 = vi.fn();
    const unsub2 = subscribe(id, '["a"]', listener2);
    // Should be clean — no stale listeners
    expect(listener2).not.toHaveBeenCalled();
    unsub2();
  });

  it("double unsubscribe does not throw", () => {
    const id = uid();
    const unsub = subscribe(id, '["a"]', vi.fn());
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// invalidate (global)
// ═══════════════════════════════════════════════════════════════════
describe("invalidate (global)", () => {
  it("refetches all entries for a cacheId when called with string", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");
    query("b");
    expect(fn).toHaveBeenCalledTimes(2);

    invalidate(id);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("refetches all entries when called with a query object", () => {
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(uid(), fn);
    query("a");
    query("b");
    expect(fn).toHaveBeenCalledTimes(2);

    invalidate(query); // pass the query object itself
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("notifies all listeners across all keys", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");
    query("b");

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    subscribe(id, '["a"]', listenerA);
    subscribe(id, '["b"]', listenerB);

    invalidate(id);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it("does not throw when invalidating a cacheId with no entries", () => {
    expect(() => invalidate("does-not-exist")).not.toThrow();
  });

  it("does not throw when invalidating a cacheId with no refetchers", () => {
    const id = uid();
    // subscribe but never fetch
    subscribe(id, '["a"]', vi.fn());
    expect(() => invalidate(id)).not.toThrow();
  });

  it("accepts an object with cacheId property", () => {
    const id = uid();
    const fn = vi.fn().mockResolvedValue("data");
    const query = createQuery(id, fn);
    query("a");

    invalidate({ cacheId: id });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
