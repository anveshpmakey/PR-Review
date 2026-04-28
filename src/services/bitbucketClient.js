import { config } from '../config/env.js';

const baseUrl = 'https://api.bitbucket.org/2.0';
const auth = Buffer.from(`${config.bitbucket.username}:${config.bitbucket.appPassword}`).toString('base64');

function headers(extra = {}) {
  return {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
    ...extra
  };
}

async function handle(res, url, parse = 'json') {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}: ${await res.text()}`);
  return parse === 'text' ? res.text() : res.json();
}

export async function getPullRequest(prId) {
  const url = `${baseUrl}/repositories/${config.bitbucket.workspace}/${config.bitbucket.repoSlug}/pullrequests/${prId}`;
  const res = await fetch(url, { headers: headers() });
  return handle(res, url, 'json');
}

export async function getPullRequestDiff(prId) {
  const url = `${baseUrl}/repositories/${config.bitbucket.workspace}/${config.bitbucket.repoSlug}/pullrequests/${prId}/diff`;
  const res = await fetch(url, { headers: headers() });
  return handle(res, url, 'text');
}

export async function getPullRequestDiffstat(prId) {
  const url = `${baseUrl}/repositories/${config.bitbucket.workspace}/${config.bitbucket.repoSlug}/pullrequests/${prId}/diffstat`;
  const res = await fetch(url, { headers: headers() });
  return handle(res, url, 'json');
}

export async function listPullRequestComments(prId, pagelen = 30) {
  const url = `${baseUrl}/repositories/${config.bitbucket.workspace}/${config.bitbucket.repoSlug}/pullrequests/${prId}/comments?pagelen=${pagelen}`;
  const res = await fetch(url, { headers: headers() });
  return handle(res, url, 'json');
}

export async function postPullRequestComment(prId, raw, inline) {
  const url = `${baseUrl}/repositories/${config.bitbucket.workspace}/${config.bitbucket.repoSlug}/pullrequests/${prId}/comments`;
  const body = inline ? { content: { raw }, inline } : { content: { raw } };
  const res = await fetch(url, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  return handle(res, url, 'json');
}
