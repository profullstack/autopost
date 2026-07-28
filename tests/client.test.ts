import { describe, it, expect, vi } from "vitest";
import {
  createAutopostClient,
  AutopostError,
  type SocialAccount,
} from "../src/index.js";

// Build a stub `fetch` whose response is whatever the spec wants. The
// SDK's only side effect is calling this function — making the spec
// drive its return value gives us full control without hitting a
// network.
function stubFetch(spec: {
  status?: number;
  body?: unknown;
  ok?: boolean;
}): { fetch: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const status = spec.status ?? 200;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: spec.ok ?? (status >= 200 && status < 300),
      status,
      statusText: "stub",
      json: async () => spec.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe("createAutopostClient", () => {
  it("throws if no token is given", () => {
    expect(() =>
      // @ts-expect-error — missing required token, that's the point.
      createAutopostClient({}),
    ).toThrow(/token is required/);
  });

  it("sends Bearer auth + correct path on listAccounts", async () => {
    const accounts: SocialAccount[] = [
      {
        id: "acc-1",
        platform: "bluesky",
        handle: "alice.bsky.social",
        status: "active",
        instance_url: null,
        last_post_at: null,
        created_at: "2026-05-15T00:00:00.000Z",
      },
    ];
    const stub = stubFetch({ body: { accounts } });
    const client = createAutopostClient({
      token: "crp_test",
      baseUrl: "https://example.test",
      fetch: stub.fetch,
    });
    const got = await client.listAccounts();
    expect(got).toEqual(accounts);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.url).toBe(
      "https://example.test/api/sp/v1/accounts",
    );
    expect(stub.calls[0]!.init?.method).toBe("GET");
    const headers = stub.calls[0]!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer crp_test");
    expect(headers["content-type"]).toBeUndefined();
  });

  it("post() includes content-type header", async () => {
    const stub = stubFetch({
      body: { post_id: "p-1", platform_post_id: "x-1", web_url: "https://x.com/1" },
    });
    const client = createAutopostClient({
      token: "crp_test",
      baseUrl: "https://example.test",
      fetch: stub.fetch,
    });
    await client.post({ accountId: "acc-1", text: "hi" });
    const headers = stub.calls[0]!.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const stub = stubFetch({ body: { accounts: [] } });
    const client = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test///",
      fetch: stub.fetch,
    });
    await client.listAccounts();
    expect(stub.calls[0]!.url).toBe("https://example.test/api/sp/v1/accounts");
  });

  it("forwards AbortSignal to requests", async () => {
    const listStub = stubFetch({ body: { accounts: [] } });
    const listClient = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test",
      fetch: listStub.fetch,
    });
    const controller = new AbortController();

    await listClient.listAccounts({ signal: controller.signal });

    expect(listStub.calls[0]!.init?.signal).toBe(controller.signal);

    const postStub = stubFetch({
      body: {
        post_id: "p-1",
        platform_post_id: "x-1",
        web_url: "https://x.com/1",
      },
    });
    const postClient = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test",
      fetch: postStub.fetch,
    });

    await postClient.post(
      { accountId: "acc-1", text: "hi" },
      { signal: controller.signal },
    );

    expect(postStub.calls[0]!.init?.signal).toBe(controller.signal);
  });

  it("post() forwards reddit-only fields and renames keys to snake_case", async () => {
    const stub = stubFetch({
      body: {
        post_id: "p-1",
        platform_post_id: "t3_xyz",
        web_url: "https://reddit.com/r/test/comments/xyz",
      },
    });
    const client = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test",
      fetch: stub.fetch,
    });
    const r = await client.post({
      accountId: "acc-1",
      text: "hi",
      subreddit: "test",
      title: "Hello",
    });
    expect(r).toEqual({
      postId: "p-1",
      platformPostId: "t3_xyz",
      webUrl: "https://reddit.com/r/test/comments/xyz",
    });
    expect(stub.calls[0]!.init?.method).toBe("POST");
    const sent = JSON.parse((stub.calls[0]!.init?.body as string) ?? "{}");
    expect(sent).toEqual({
      account_id: "acc-1",
      text: "hi",
      subreddit: "test",
      title: "Hello",
    });
  });

  it("throws a typed error when the API returns a non-2xx", async () => {
    const stub = stubFetch({
      status: 401,
      ok: false,
      body: { error: "Invalid or revoked token." },
    });
    const client = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test",
      fetch: stub.fetch,
    });
    await expect(client.listAccounts()).rejects.toMatchObject({
      name: "AutopostError",
      status: 401,
      message: "Invalid or revoked token.",
    });
    await expect(client.listAccounts()).rejects.toBeInstanceOf(
      AutopostError,
    );
  });

  it("falls back to status text when body has no error field", async () => {
    const stub = stubFetch({
      status: 500,
      ok: false,
      body: { something_else: true },
    });
    const client = createAutopostClient({
      token: "crp_t",
      baseUrl: "https://example.test",
      fetch: stub.fetch,
    });
    await expect(client.listAccounts()).rejects.toMatchObject({
      status: 500,
      message: "500 stub",
    });
  });
});
