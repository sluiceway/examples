// The one way the driver talks to GitHub. Every call goes through `request`
// or `graphql`, and both refuse anything outside the test bed, apart from a
// few reads of the action repo. A local run and a run in Actions pass the same
// check (docs/release-verification.md, "The reset and the cleanup", step 1).
import { execFileSync } from "node:child_process";

export const OWNER = "sluiceway";
export const TEST_BED = "release-verify";
export const TEST_BED_REPO = `${OWNER}/${TEST_BED}`;
export const ACTION_REPO = `${OWNER}/sluiceway`;

const API = "https://api.github.com";
const TEST_BED_PATH = `/repos/${TEST_BED_REPO}/`;

// Reads outside the test bed the driver needs: who the token belongs to (the
// ticker), and of the action repo the tag under test, the latest release and
// files at the tag.
const ACTION_READS = [
  "/user",
  `/repos/${ACTION_REPO}/git/ref/tags/`,
  `/repos/${ACTION_REPO}/releases/latest`,
  `/repos/${ACTION_REPO}/contents/`,
];

export class TargetError extends Error {}

function checkTarget(method: string, path: string): void {
  if (path.startsWith(TEST_BED_PATH)) return;
  // An entry that ends in a slash is a prefix, any other one is the path.
  const read = (entry: string) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry);
  if (method === "GET" && ACTION_READS.some(read)) return;
  throw new TargetError(`Refused ${method} ${path}: the driver only writes to ${TEST_BED_REPO}.`);
}

// The token: the test bot's in Actions, the owner's `gh` login on a laptop.
export function findToken(): string {
  const fromEnv = process.env.RELEASE_VERIFY_BOT_TOKEN;
  if (fromEnv) return fromEnv;
  if (process.env.GITHUB_ACTIONS === "true") {
    throw new Error("RELEASE_VERIFY_BOT_TOKEN is not set, and a run in Actions never falls back to another token.");
  }
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

export interface Response<T> {
  status: number;
  data: T;
  headers: Headers;
}

export class GitHub {
  requests = 0;
  // Node ids a mutation may name: only ones read from the test bed.
  private readonly nodeIds = new Set<string>();

  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "sluiceway-release-verify",
      ...extra,
    };
  }

  // One REST call. A status of 400 or more throws, unless `allow` lists it.
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    allow: number[] = [],
  ): Promise<Response<T>> {
    checkTarget(method, path.split("?")[0] ?? path);
    for (let attempt = 1; ; attempt++) {
      this.requests++;
      const response = await send(`${API}${path}`, {
        method,
        headers: this.headers(body === undefined ? {} : { "content-type": "application/json" }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // GitHub answers a burst of writes with 403 or 429 and a retry time, and
      // sometimes with a 502. Wait and try again, at most five times.
      const retry =
        response.status === 429 ||
        response.status >= 502 ||
        (response.status === 403 && response.headers.get("retry-after") !== null);
      if (retry && attempt < 5) {
        const seconds = Number(response.headers.get("retry-after") ?? 0) || attempt * 5;
        await sleep(seconds * 1000);
        continue;
      }
      const text = await response.text();
      const data = (text === "" ? null : safeJson(text)) as T;
      if (response.status >= 400 && !allow.includes(response.status)) {
        throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
      }
      return { status: response.status, data, headers: response.headers };
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return (await this.request<T>("GET", path)).data;
  }

  // Every page of a list. `key` names the list in an answer that wraps it,
  // such as `workflow_runs`.
  async paginate<T>(path: string, key?: string): Promise<T[]> {
    const all: T[] = [];
    const joiner = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
      const data = await this.get<unknown>(`${path}${joiner}per_page=100&page=${page}`);
      const items = (key ? (data as Record<string, T[]>)[key] : data) as T[];
      all.push(...items);
      if (items.length < 100) return all;
    }
  }

  // A zip file behind an API path, such as a run's logs or an artifact.
  // GitHub answers with a redirect to its storage, which fetch follows
  // without the token.
  async download(path: string): Promise<Buffer> {
    checkTarget("GET", path);
    this.requests++;
    const response = await send(`${API}${path}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  // A GraphQL query about the test bed. The query takes $owner and $name, and
  // the driver fills them in, so it cannot name another repo.
  async graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (/\bmutation\b/.test(query)) {
      for (const [key, value] of Object.entries(variables)) {
        if (key.endsWith("Id") && !this.nodeIds.has(String(value))) {
          throw new TargetError(`Refused a mutation on ${String(value)}: not a node of ${TEST_BED_REPO}.`);
        }
      }
    } else if (!query.includes("repository(owner: $owner, name: $name)")) {
      throw new TargetError("Refused a query that does not read the test bed through $owner and $name.");
    }
    const isMutation = /\bmutation\b/.test(query);
    this.requests++;
    const response = await send(`${API}/graphql`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ query, variables: isMutation ? variables : { ...variables, owner: OWNER, name: TEST_BED } }),
    });
    const answer = (await response.json()) as { data?: T; errors?: unknown };
    if (!response.ok || answer.errors) {
      throw new Error(`GraphQL: ${response.status} ${JSON.stringify(answer.errors ?? answer)}`);
    }
    return answer.data as T;
  }

  // A node id read from the test bed, which a later mutation may name.
  allowNode(id: string): string {
    this.nodeIds.add(id);
    return id;
  }
}

// fetch, tried again up to five times when the network fails before GitHub
// answers ("fetch failed"). An answer, of any status, is the caller's.
async function send(url: string, init: RequestInit): Promise<globalThis.Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : "";
      if (attempt >= 5) throw new Error(`${init.method ?? "GET"} ${url}: ${String(error)}${cause} after ${attempt} tries`);
      await sleep(attempt * 3_000);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

export const repoPath = (rest: string): string => `/repos/${TEST_BED_REPO}${rest}`;
