/* Cloudflare Worker - CLC SR Portal Background Video Upload */

// 將原有的 10MB 改為 50MB
const HOME_VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const HOME_VIDEO_FILE_PATH = 'home-background.mp4';

const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

function githubVideoHeaders(token) {
  return {
    'accept': 'application/vnd.github+json',
    'authorization': 'Bearer ' + token.trim(),
    'user-agent': 'clc-sr-portal-cloudflare-pages',
    'x-github-api-version': '2022-11-28'
  };
}

async function uploadHomeVideo(request, env) {
  if (request.method !== 'POST') return response({ error: '只接受 POST 上傳。' }, 405);
  
  const token = env.GITHUB_VIDEO_TOKEN || env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER || 'CLC-Darren';
  const repo = env.GITHUB_REPO || 'clc-sr-portal';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!token) {
    return response({ error: '尚未在 Cloudflare 設定 GITHUB_VIDEO_TOKEN 環境變數。' }, 503);
  }

  const declaredSize = request.headers.get('x-home-video-size') || '';
  const size = Number(declaredSize);
  if (size <= 0 || size > HOME_VIDEO_MAX_SIZE) {
    return response({ error: '請使用不超過 10 MB 的 MP4。' }, 413);
  }

  const base64Content = await request.text();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${HOME_VIDEO_FILE_PATH}?ref=${branch}`;
  const headers = githubVideoHeaders(token);

  try {
    let oldSha = '';
    const existing = await fetch(apiUrl, { headers });
    if (existing.status === 200) {
      const data = await existing.json();
      oldSha = data.sha || '';
    }

    const putBody = {
      message: 'Update homepage background video via CLC SR admin',
      branch: branch,
      content: base64Content,
      ...(oldSha ? { sha: oldSha } : {})
    };

    const uploaded = await fetch(apiUrl.split('?')[0], {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(putBody)
    });

    if (!uploaded.ok) {
      const errData = await uploaded.text();
      return response({ error: `GitHub 上傳失敗 (HTTP ${uploaded.status})：${errData}` }, 502);
    }

    return response({ ok: true, videoPath: '/home-background.mp4' });
  } catch (error) {
    return response({ error: '連線 GitHub 失敗：' + error.message }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/home-video-upload') {
      return uploadHomeVideo(request, env);
    }

    if (env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  }
};
