import { badRequest, upstream } from '../../shared/errors.ts';
import type {
  AylabsFile,
  AylabsRepository,
} from '../../domain/aylabs/repositories/AylabsRepository.ts';

export interface GitHubAylabsConfig {
  token: string | null;
  repo: string;
  branch: string;
}

const API = 'https://api.github.com';

/**
 * Le dépôt du site par l'API GitHub. Le commit passe par la Git Data API (arbre, commit,
 * référence) et non par `PUT contents` : deux fiches en un seul commit, donc un seul
 * déploiement du site, comme le fait l'Aylabs Content Studio.
 */
export class GitHubAylabsRepository implements AylabsRepository {
  private readonly config: GitHubAylabsConfig;

  constructor(config: GitHubAylabsConfig) {
    this.config = config;
  }

  configured(): boolean {
    return this.config.token !== null;
  }

  repo(): string {
    return this.config.repo;
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    if (!this.config.token) {
      throw badRequest('Renseigne AYLABS_GITHUB_TOKEN pour écrire dans le dépôt du site.');
    }
    let response: Response;
    try {
      response = await fetch(`${API}/repos/${this.config.repo}/${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.config.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'creator-studio',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      throw upstream(`GitHub injoignable : ${(error as Error).message}`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw upstream(`GitHub ${response.status} sur ${path} : ${detail.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  async listSlugs(kind: 'videos' | 'products'): Promise<string[]> {
    const entries = await this.call<{ name: string; type: string }[]>(
      `contents/src/content/${kind}?ref=${encodeURIComponent(this.config.branch)}`,
    );
    return entries
      .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3));
  }

  async commit(files: AylabsFile[], message: string): Promise<string> {
    const branch = this.config.branch;
    const ref = await this.call<{ object: { sha: string } }>(
      `git/ref/heads/${encodeURIComponent(branch)}`,
    );
    const parent = await this.call<{ tree: { sha: string } }>(`git/commits/${ref.object.sha}`);
    const tree = await this.call<{ sha: string }>('git/trees', {
      method: 'POST',
      body: {
        base_tree: parent.tree.sha,
        tree: files.map((file) => ({
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: file.content,
        })),
      },
    });
    const commit = await this.call<{ sha: string; html_url: string }>('git/commits', {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [ref.object.sha] },
    });
    // Sans `force` : si quelqu'un a poussé entre-temps, GitHub refuse plutôt que d'écraser.
    await this.call(`git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      body: { sha: commit.sha },
    });
    return commit.html_url;
  }
}
