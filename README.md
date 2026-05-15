# @profullstack/autopost

Typed Node SDK for posting to social platforms via a [Crawlproof](https://crawlproof.com) account. Post to any social account a user has connected on crawlproof.com — Bluesky, Reddit, Mastodon, LinkedIn, X, Facebook Pages, Threads, Discord, Telegram — from any Node program, CI job, or CLI.

## Why

Crawlproof centralises the OAuth dance + token encryption for ~9 social platforms (today; more coming). Once a user has connected their accounts in the crawlproof.com UI, this SDK lets external programs post via those connections without re-doing per-platform OAuth.

Use cases:
- `sh1pt promote` and similar release-orchestration CLIs.
- CI jobs that announce new versions.
- Internal admin scripts.

## Install

```bash
pnpm add @profullstack/autopost
# or
npm i @profullstack/autopost
```

Node 18+.

## Setup

1. Sign in at <https://crawlproof.com>.
2. Connect the social accounts you want to post to (`/social/setup`).
3. Generate an API token at `/social/api-tokens`. **Copy it once** — only the hash is stored, you can't view it again.
4. Set `AUTOPOST_TOKEN` (or whatever env var name you prefer) in your environment.

## Usage

```ts
import { createAutopostClient } from "@profullstack/autopost";

const client = createAutopostClient({
  token: process.env.AUTOPOST_TOKEN!,
});

// List the user's connected accounts.
const accounts = await client.listAccounts();
//=> [{ id, platform, handle, status, instance_url, last_post_at, created_at }, …]

// Post to one of them.
const result = await client.post({
  accountId: accounts[0].id,
  text: "Shipped a new version: https://example.com/changelog",
});
//=> { postId, platformPostId, webUrl }
```

### Reddit

Reddit requires per-post `subreddit` + `title`:

```ts
await client.post({
  accountId: redditAccount.id,
  text: "Body of the self-post in markdown.",
  subreddit: "webdev",
  title: "Just shipped: $thing",
});
```

### Custom base URL (self-hosted / staging)

```ts
const client = createAutopostClient({
  token: process.env.AUTOPOST_TOKEN!,
  baseUrl: "https://staging.crawlproof.com",
});
```

### Error handling

Non-2xx responses throw `AutopostError`:

```ts
import { AutopostError } from "@profullstack/autopost";

try {
  await client.post({ accountId, text });
} catch (err) {
  if (err instanceof AutopostError) {
    console.error(`HTTP ${err.status}: ${err.message}`);
    // err.body is the parsed JSON error body (if any)
  }
  throw err;
}
```

## API

### `createAutopostClient(options)`

| Option    | Type             | Description                                                                 |
| --------- | ---------------- | --------------------------------------------------------------------------- |
| `token`   | `string`         | Required. Bearer token from `/social/api-tokens` (starts with `crp_`).      |
| `baseUrl` | `string`         | Optional. Defaults to `https://crawlproof.com`.                             |
| `fetch`   | `typeof fetch`   | Optional. Inject your own fetch (e.g. `undici`). Defaults to global fetch.  |

Returns `{ listAccounts, post }`.

### `listAccounts(): Promise<SocialAccount[]>`

Returns the user's connected social accounts. `instance_url` is non-null only for federated platforms (Mastodon today).

### `post(input): Promise<PostResult>`

| Field       | Type     | Description                                                       |
| ----------- | -------- | ----------------------------------------------------------------- |
| `accountId` | `string` | Required. From `listAccounts()`.                                  |
| `text`      | `string` | Required. The post body. Char limit is enforced server-side per platform. |
| `subreddit` | `string` | Required for Reddit accounts.                                     |
| `title`     | `string` | Required for Reddit accounts.                                     |

Returns `{ postId, platformPostId, webUrl }` — `postId` is crawlproof's row id (for later querying), `platformPostId` is whatever the target platform returned, `webUrl` is a permalink.

## License

MIT.
