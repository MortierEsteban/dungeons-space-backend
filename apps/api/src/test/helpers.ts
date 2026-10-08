import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type BuiltApp } from '../app';
import { testConfig } from '../config';

export async function createTestApp(): Promise<BuiltApp> {
  return buildApp(testConfig(), { realtime: 'none' });
}

/** Client HTTP de test qui conserve le cookie de session, comme un navigateur. */
export class TestClient {
  private cookie = '';

  constructor(private readonly built: BuiltApp) {}

  async request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<LightMyRequestResponse> {
    const res = await this.built.app.inject({
      method,
      url: `/api${url}`,
      headers: this.cookie ? { cookie: this.cookie } : {},
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const set = res.headers['set-cookie'];
    const first = Array.isArray(set) ? set[0] : set;
    if (first) this.cookie = first.split(';')[0]!;
    return res;
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, body: unknown = {}) => this.request('POST', url, body);
  patch = (url: string, body: unknown) => this.request('PATCH', url, body);
  put = (url: string, body: unknown) => this.request('PUT', url, body);
  delete = (url: string) => this.request('DELETE', url);

  async register(name: string): Promise<{ id: string; email: string }> {
    const email = `${name.toLowerCase()}@test.local`;
    const res = await this.post('/auth/register', { displayName: name, email, password: 'motdepasse-solide' });
    if (res.statusCode !== 201) throw new Error(res.body);
    return { id: res.json().user.id, email };
  }
}
