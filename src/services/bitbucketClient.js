function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function createBitbucketClient({ baseUrl, username, appPassword, accessToken }, { fetchImpl = fetch } = {}) {
  const authorization = accessToken
    ? `Bearer ${accessToken}`
    : `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;

  async function request(url, { method = 'GET', body, parse = 'json', allow404 = false } = {}) {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: authorization,
        Accept: parse === 'json' ? 'application/json' : '*/*',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`Bitbucket ${method} ${url} failed: ${res.status} ${res.statusText} ${(await res.text()).slice(0, 500)}`);
    return parse === 'text' ? res.text() : res.json();
  }

  const repoUrl = repo => `${baseUrl}/repositories/${repo}`;
  const prUrl = (repo, prId) => `${repoUrl(repo)}/pullrequests/${prId}`;

  return {
    getPullRequest: (repo, prId) => request(prUrl(repo, prId)),
    getPullRequestDiff: (repo, prId) => request(`${prUrl(repo, prId)}/diff`, { parse: 'text' }),

    async listPullRequestComments(repo, prId, maxPages = 20) {
      const comments = [];
      let url = `${prUrl(repo, prId)}/comments?pagelen=100`;
      for (let page = 0; url && page < maxPages; page += 1) {
        const data = await request(url);
        comments.push(...(data.values || []));
        url = data.next;
      }
      return comments;
    },

    getFileContent: (repo, commit, path) =>
      request(`${repoUrl(repo)}/src/${encodeURIComponent(commit)}/${encodePath(path)}`, { parse: 'text', allow404: true }),

    postPullRequestComment(repo, prId, raw, inline) {
      const body = inline ? { content: { raw }, inline } : { content: { raw } };
      return request(`${prUrl(repo, prId)}/comments`, { method: 'POST', body });
    }
  };
}
