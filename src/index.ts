// @profullstack/autopost
//
// Typed Node SDK for posting to social platforms via a Crawlproof
// account. Wraps crawlproof.com's social posting API:
//   GET  /api/sp/v1/accounts   — list a user's connected social accounts
//   POST /api/sp/v1/posts      — publish a post via one of those accounts
//
// Auth: Bearer token issued at https://crawlproof.com/social/api-tokens.
//
// Usage:
//   import { createAutopostClient } from "@profullstack/autopost";
//   const client = createAutopostClient({ token: process.env.AUTOPOST_TOKEN! });
//   const accounts = await client.listAccounts();
//   await client.post({ accountId: accounts[0].id, text: "hello world" });

export type Platform =
  | "bluesky"
  | "reddit"
  | "mastodon"
  | "linkedin"
  | "x"
  | "facebook_page"
  | "threads"
  | "discord"
  | "telegram"
  // Schema-supported, posting-not-yet-implemented on crawlproof:
  | "pinterest"
  | "instagram"
  | "instagram_business"
  | "tiktok"
  | "youtube"
  | "tumblr"
  | "snapchat";

export type AccountStatus =
  | "active"
  | "token_expired"
  | "suspended_by_platform"
  | "user_disabled"
  | "flagged";

export interface SocialAccount {
  id: string;
  platform: Platform;
  handle: string;
  status: AccountStatus;
  instance_url: string | null;
  last_post_at: string | null;
  created_at: string;
}

export interface PostInput {
  accountId: string;
  text: string;
  // Reddit-only — required when posting to a reddit account.
  subreddit?: string;
  title?: string;
}

export interface PostResult {
  postId: string;
  platformPostId: string;
  webUrl: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface AutopostClient {
  listAccounts(options?: RequestOptions): Promise<SocialAccount[]>;
  post(input: PostInput, options?: RequestOptions): Promise<PostResult>;
}

export interface ClientOptions {
  /** Bearer token from https://crawlproof.com/social/api-tokens — required. */
  token: string;
  /** Defaults to https://crawlproof.com. Override for self-hosted / staging. */
  baseUrl?: string;
  /** Override the global fetch (e.g. inject undici). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://crawlproof.com";

export class AutopostError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "AutopostError";
    this.status = status;
    this.body = body;
  }
}

function getErrorMessage(
  status: number,
  statusText: string,
  body: unknown,
): string {
  if (body && typeof body === "object") {
    if ("error" in body) {
      return String((body as { error: unknown }).error);
    }
    if ("message" in body) {
      return String((body as { message: unknown }).message);
    }
  }
  return `${status} ${statusText}`;
}

export function createAutopostClient(
  options: ClientOptions,
): AutopostClient {
  if (!options.token) {
    throw new Error("autopost: token is required");
  }
  const rawBaseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(rawBaseUrl)) {
    throw new Error("autopost: baseUrl must be an http(s) URL");
  }
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "autopost: no fetch implementation available (Node 18+ provides one)",
    );
  }
  const authHeader = { authorization: `Bearer ${options.token}` };

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const hasBody = init.body != null;
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...authHeader,
          ...(hasBody ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new AutopostError(
        0,
        `autopost: request failed: ${(cause as Error).message}`,
        cause,
      );
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON response; fall through with body = null
    }
    if (!res.ok) {
      const message = getErrorMessage(res.status, res.statusText, body);
      throw new AutopostError(res.status, message, body);
    }
    if (body == null || typeof body !== "object") {
      throw new AutopostError(
        res.status,
        `autopost: unexpected ${res.status} response body`,
        body,
      );
    }
    return body as T;
  }

  return {
    async listAccounts(options?: RequestOptions): Promise<SocialAccount[]> {
      const r = await call<{ accounts: SocialAccount[] }>(
        "/api/sp/v1/accounts",
        { method: "GET", signal: options?.signal },
      );
      return r.accounts;
    },
    async post(
      input: PostInput,
      options?: RequestOptions,
    ): Promise<PostResult> {
      if (!input.accountId || typeof input.text !== "string" || !input.text) {
        throw new Error("autopost: accountId and text are required");
      }
      const r = await call<{
        post_id: string;
        platform_post_id: string;
        web_url: string;
      }>("/api/sp/v1/posts", {
        method: "POST",
        signal: options?.signal,
        body: JSON.stringify({
          account_id: input.accountId,
          text: input.text,
          subreddit: input.subreddit,
          title: input.title,
        }),
      });
      return {
        postId: r.post_id,
        platformPostId: r.platform_post_id,
        webUrl: r.web_url,
      };
    },
  };
}
