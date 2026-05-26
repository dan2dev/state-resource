# state-resource

Promise caching, deduplication, and invalidation with a React hook — no context, no provider, no boilerplate.

```bash
npm i state-resource
# or
bun add state-resource
```

React is an optional peer dependency. The core cache (`createQuery` / `invalidate`) works in any environment.

---

## Quick start

```ts
// queries.ts
import { createQuery } from 'state-resource'

export const userQuery = createQuery('users', (id: number) =>
  fetch(`/api/users/${id}`).then(r => r.json())
)
```

```tsx
// UserCard.tsx
import { useQuery } from 'state-resource'
import { userQuery } from './queries'

function UserCard({ userId }: { userId: number }) {
  const user = useQuery(userQuery, [userId])

  if (user.status === 'loading') return <Spinner />
  if (user.status === 'error')   return <p>Error: {user.error.message}</p>

  return <p>{user.data.name}</p>
}
```

---

## API

### `createQuery(cacheId, fn)`

Creates a typed, cached async query.

```ts
const userQuery = createQuery('users', async (id: number) => {
  const res = await fetch(`/api/users/${id}`)
  return res.json() as Promise<User>
})
```

| Param     | Type                             | Description                        |
| --------- | -------------------------------- | ---------------------------------- |
| `cacheId` | `string`                         | Unique key for this query's cache  |
| `fn`      | `(...args: A) => Promise<R>`     | Async function that fetches data   |

Returns a `Query<A, R>` — a callable function with extra methods:

| Member              | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `query(...args)`    | Call to get the cached promise (or start a new fetch)   |
| `query.invalidate(...args)` | Refetch a specific cache entry and notify subscribers |
| `query.clear()`     | Wipe all cached entries for this query                  |
| `query.cacheId`     | Read-only string, the ID passed at creation             |

**Caching is argument-based.** The same arguments always return the same promise. Object argument key order is normalized, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` hit the same cache entry.

```ts
userQuery(1) === userQuery(1)  // true — same promise, only one fetch
userQuery(1) !== userQuery(2)  // different args → different entries
```

**Failed promises are evicted automatically**, so the next call re-fetches cleanly without manual cleanup.

---

### `invalidate(target)`

Global invalidation: refetches every cached entry for a query and notifies all subscribers.

```ts
import { invalidate } from 'state-resource'

// by cacheId string
invalidate('users')

// by query object (same result)
invalidate(userQuery)
```

Use this after a mutation that affects multiple cached entries at once — e.g. after saving a user, invalidate the whole users query.

---

### `useQuery(query, args)`

React hook. Subscribes to a query and returns its current state.

```tsx
const result = useQuery(userQuery, [userId])
```

Returns `QueryResult<T>`:

```ts
type QueryResult<T> =
  | { status: 'loading'; data?: T;         error?: undefined; refresh: () => void }
  | { status: 'ok';      data: T;          error?: undefined; refresh: () => void }
  | { status: 'error';   data?: T;         error: Error;      refresh: () => void }
```

- **`status: 'loading'`** — fetch in progress. `data` carries the previous value while reloading (stale-while-revalidate).
- **`status: 'ok'`** — fetch succeeded.
- **`status: 'error'`** — fetch failed. Failed promise is evicted from cache so retry is clean.
- **`refresh()`** — invalidates this entry and triggers a re-fetch. Reference is stable as long as args don't change.

---

## Examples

### 1 · Cache deduplication

Two components call the same query with the same args. Only one HTTP request fires — both share the cached promise.

```tsx
function Page() {
  return (
    <>
      <UserBadge userId={1} />  {/* fetches userQuery(1) */}
      <UserAvatar userId={1} /> {/* cache hit — no second request */}
    </>
  )
}

function UserBadge({ userId }: { userId: number }) {
  const user = useQuery(userQuery, [userId])
  if (user.status !== 'ok') return null
  return <span>{user.data.name}</span>
}

function UserAvatar({ userId }: { userId: number }) {
  const user = useQuery(userQuery, [userId])
  if (user.status !== 'ok') return null
  return <img src={user.data.avatarUrl} alt={user.data.name} />
}
```

---

### 2 · Per-entry invalidation

Refresh a single user without touching any other cached users.

```tsx
function UserCard({ userId }: { userId: number }) {
  const user = useQuery(userQuery, [userId])

  return (
    <div>
      {user.status === 'loading' && <Spinner />}
      {user.status === 'ok' && <p>{user.data.name} — {user.data.role}</p>}
      {user.status === 'error' && <p>Error: {user.error.message}</p>}

      <button onClick={user.refresh} disabled={user.status === 'loading'}>
        Refresh
      </button>
    </div>
  )
}
```

`user.refresh()` calls `userQuery.invalidate(userId)` internally — only that one cache slot is updated. Other `UserCard`s with different `userId`s are unaffected.

---

### 3 · Global invalidation after mutation

After saving a record, invalidate the whole query so every component refetches.

```ts
async function saveUser(user: User) {
  await fetch('/api/users', { method: 'POST', body: JSON.stringify(user) })

  // Refetch all cached users in every mounted component at once
  invalidate(userQuery)
}
```

---

### 4 · Multi-argument queries

Arguments are spread, not wrapped — the type system enforces them at the call site.

```ts
const postsQuery = createQuery(
  'posts',
  (userId: number, page: number) =>
    fetch(`/api/users/${userId}/posts?page=${page}`).then(r => r.json())
)

// In a component:
const posts = useQuery(postsQuery, [userId, page])
```

---

### 5 · Object arguments (stable key)

Object key order is normalized, so re-renders with structurally equal objects don't trigger a new fetch.

```ts
const searchQuery = createQuery('search', (filter: { q: string; page: number }) =>
  fetch(`/api/search?q=${filter.q}&page=${filter.page}`).then(r => r.json())
)

// These are the same cache entry:
searchQuery({ q: 'hello', page: 1 })
searchQuery({ page: 1, q: 'hello' })
```

```tsx
function SearchResults() {
  const [filter, setFilter] = useState({ q: '', page: 1 })
  const results = useQuery(searchQuery, [filter])

  return (
    <>
      <input
        value={filter.q}
        onChange={e => setFilter(f => ({ ...f, q: e.target.value, page: 1 }))}
      />
      {results.status === 'loading' && <Spinner />}
      {results.status === 'ok' && results.data.map(r => <p key={r.id}>{r.title}</p>)}
    </>
  )
}
```

---

### 6 · Dependent queries

Load a user, then load their posts only once the userId is known. Switching back to a previously selected user is instant — both caches are warm.

```tsx
function UserDashboard() {
  const [userId, setUserId] = useState(1)
  const user = useQuery(userQuery, [userId])

  return (
    <div>
      <UserSelector onChange={setUserId} />
      {user.status === 'ok' && (
        <>
          <UserProfile user={user.data} />
          <PostList userId={userId} />
        </>
      )}
    </div>
  )
}

function PostList({ userId }: { userId: number }) {
  const posts = useQuery(postsQuery, [userId])
  if (posts.status === 'loading') return <Spinner />
  if (posts.status === 'error') return <p>Failed to load posts</p>
  return (
    <ul>
      {posts.data.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  )
}
```

---

### 7 · Error recovery

Failed fetches are evicted from the cache automatically. Calling `refresh()` or changing args re-fetches cleanly.

```tsx
function WeatherCard({ city }: { city: string }) {
  const weather = useQuery(weatherQuery, [city])

  return (
    <div>
      {weather.status === 'loading' && <Spinner />}
      {weather.status === 'ok' && <p>{weather.data.temp}°C — {weather.data.condition}</p>}
      {weather.status === 'error' && (
        <>
          <p>Error: {weather.error.message}</p>
          <button onClick={weather.refresh}>Retry</button>
        </>
      )}
    </div>
  )
}
```

---

### 8 · Using the cache outside React

`createQuery` and `invalidate` are plain functions — no React required.

```ts
import { createQuery, invalidate } from 'state-resource'

const configQuery = createQuery('config', () =>
  fetch('/api/config').then(r => r.json())
)

// Warm the cache at app startup
await configQuery()

// Later, after config changes on the server:
invalidate(configQuery)
```

---

### 9 · Clearing the cache

Use `query.clear()` to wipe all entries — useful on logout or when switching accounts.

```ts
async function logout() {
  await fetch('/api/logout', { method: 'POST' })

  // Purge all cached data
  userQuery.clear()
  postsQuery.clear()
  settingsQuery.clear()
}
```

---

## TypeScript

Fully typed. Arguments and return types flow through automatically.

```ts
const userQuery = createQuery('users', async (id: number) => {
  const res = await fetch(`/api/users/${id}`)
  return res.json() as Promise<{ id: number; name: string }>
})

// TypeScript knows: data is { id: number; name: string }
const user = useQuery(userQuery, [1])
if (user.status === 'ok') {
  console.log(user.data.name) // ✓
}

// TypeScript enforces args — this won't compile:
useQuery(userQuery, ['not-a-number']) // ✗ Argument of type 'string' is not assignable to type 'number'
```

---

## How it works

- **Cache** — a `Map<argsKey, Promise<R>>` per `cacheId`. The same args return the same promise instance.
- **Stable key** — arguments are serialized with `JSON.stringify` with sorted object keys, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` map to the same key.
- **Invalidation** — replaces the cache entry with a fresh promise and notifies all subscribers.
- **Subscribers** — `useQuery` registers a listener that bumps a counter, triggering a re-render when its key is invalidated.
- **Cancellation** — effects use a `cancelled` flag; stale fetch results are discarded after arg changes or unmount.
- **Error eviction** — rejected promises are removed from the cache via a `.catch()` guard, so the next call always starts fresh.

---

## Release

```bash
make release-patch   # 0.3.0 → 0.3.1
make release-minor   # 0.3.0 → 0.4.0
make release-major   # 0.3.0 → 1.0.0

# or with explicit bump:
make publish BUMP=minor
```

Each release: builds, bumps `package.json`, commits, publishes to npm, tags, and pushes.

---

## License

MIT
