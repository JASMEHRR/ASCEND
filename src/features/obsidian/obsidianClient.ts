/**
 * Client for the Obsidian **Local REST API** community plugin — the supported way
 * for an external app to read/write a local vault. The plugin runs on the user's
 * machine and exposes an authenticated HTTP endpoint (default https://127.0.0.1:27124).
 *
 * ASCEND never sees the vault or the key on any server: this runs entirely in the
 * browser, talking to the user's own localhost. Config is user-supplied (no
 * hardcoded paths/secrets) and stored in secure local storage.
 */
export interface ObsidianConfig {
  /** e.g. https://127.0.0.1:27124 (from the Local REST API plugin). */
  baseUrl: string;
  /** The plugin's API key. */
  apiKey: string;
}

export interface ObsidianNote {
  path: string;
  content: string;
}

export interface SearchHit {
  path: string;
  score?: number;
  context?: string;
}

export class ObsidianError extends Error {}

export class ObsidianClient {
  constructor(private config: ObsidianConfig) {}

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new ObsidianError(`Obsidian ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}`);
    return res;
  }

  /** Verify the endpoint + key are valid (plugin `/` returns server info). */
  async ping(): Promise<boolean> {
    await this.req('/');
    return true;
  }

  /** List note paths under a folder (recursive vault listing). */
  async listNotes(folder = ''): Promise<string[]> {
    const dir = folder ? `/vault/${encodeURI(folder.replace(/^\/|\/$/g, ''))}/` : '/vault/';
    const data = await (await this.req(dir)).json();
    return (data.files ?? []) as string[];
  }

  /** Full-text search; returns matching note paths with context. */
  async search(query: string): Promise<SearchHit[]> {
    const res = await this.req(`/search/simple/?query=${encodeURIComponent(query)}`, { method: 'POST' });
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((d: any) => ({
      path: d.filename ?? d.path,
      score: d.score,
      context: Array.isArray(d.matches) ? d.matches[0]?.context : undefined,
    }));
  }

  /** Read a note's markdown. */
  async readNote(path: string): Promise<ObsidianNote> {
    const res = await this.req(`/vault/${encodeURI(path)}`, { headers: { Accept: 'text/markdown' } });
    return { path, content: await res.text() };
  }

  /** Create or overwrite a note (folders are created implicitly by the plugin). */
  async writeNote(path: string, content: string): Promise<void> {
    await this.req(`/vault/${encodeURI(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });
  }

  /** Append markdown to an existing note (creates it if missing). */
  async appendNote(path: string, content: string): Promise<void> {
    await this.req(`/vault/${encodeURI(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: content.startsWith('\n') ? content : `\n${content}`,
    });
  }
}
