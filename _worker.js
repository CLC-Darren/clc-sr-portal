/* Cloudflare Worker - CLC SR Portal Background Video Upload */

const HOME_VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50MB
// 指定路徑：clc-assets 倉庫底下的 videos/sr/home-background.mp4
const HOME_VIDEO_FILE_PATH = 'videos/sr/home-background.mp4';
const HOME_VIDEO_MAX_BASE64 = Math.ceil(HOME_VIDEO_MAX_SIZE / 3) * 4;

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

// 串流封裝：避免在 Worker 記憶體中複製 50MB 以上字串導致 CPU 或記憶體溢位
function videoCommitStream(base64Body, beginning, ending, expectedLength) {
  const reader = base64Body.getReader();
  const encoder = new TextEncoder();
  let stage = 0;
  let size = 0;
  let first = '';

  return new ReadableStream({
    async pull(controller) {
      if (stage === 0) {
        controller.enqueue(encoder.encode(beginning));
        stage = 1;
        return;
      }
      if (stage === 1) {
        const { value, done } = await reader.read();
        if (!done) {
          size += value.byteLength;
          if (size <= 64) {
            first += new TextDecoder().decode(value, { stream: true });
            if (first.length >= 8 && !/^[A-Za-z0-9+/=]+$/.test(first.trim().slice(0, 8))) {
              throw new Error('影片格式錯誤，僅接受 Base64 編碼。');
            }
          }
          if (size > expectedLength || size > HOME_VIDEO_MAX_BASE64) {
            throw new Error('影片超出 50 MB 大小限制。');
          }
          controller.enqueue(value);
          return;
        }
        if (size !== expectedLength) {
          throw new Error('傳輸內容大小不相符。');
        }
        stage = 2;
      }
      if (stage === 2) {
        controller.enqueue(encoder.encode(ending));
        stage = 3;
        controller.close();
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch (_) {}
    }
  });
}

async function uploadHomeVideo(request, env) {
  if (request.method !== 'POST') return response({ error: '只接受 POST 上傳。' }, 405);

  const token = env.GITHUB_VIDEO_TOKEN || env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER || 'CLC-Darren';
  const repo = 'clc-assets';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!token) {
    return response({ error: '尚未在 Cloudflare 設定 GITHUB_VIDEO_TOKEN 環境變數。' }, 503);
  }

  const declaredSize = request.headers.get('x-home-video-size') || '';
  const rawLength = request.headers.get('content-length') || '';
  if (!/^\d+$/.test(declaredSize)) {
    return response({ error: '影片大小資訊無效。' }, 400);
  }

  const size = Number(declaredSize);
  if (size <= 0 || size > HOME_VIDEO_MAX_SIZE) {
    return response({ error: '請使用不超過 50 MB 的 MP4。' }, 413);
  }

  const encodedLength = Math.ceil(size / 3) * 4;
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) !== encodedLength)) {
    return response({ error: '上傳資料大小不符。' }, 400);
  }

  if (!request.body) {
    return response({ error: '未接收到影片內容。' }, 400);
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${HOME_VIDEO_FILE_PATH}?ref=${encodeURIComponent(branch)}`;
  const headers = githubVideoHeaders(token);

  try {
    let oldSha = '';
    const existing = await fetch(apiUrl, { headers });
    if (existing.status === 200) {
      const data = await existing.json();
      oldSha = data.sha || '';
      if (!/^[a-f0-9]{40}$/.test(oldSha)) {
        return response({ error: '無法取得 GitHub 原影片版本識別碼。' }, 502);
      }
    } else if (existing.status !== 404) {
      return response({ error: `無法查詢 GitHub 影片版本 (HTTP ${existing.status})，請確認 Token 權限。` }, 502);
    }

    const beginning = JSON.stringify({
      message: 'Update homepage background video for CLC SR',
      branch: branch,
      ...(oldSha ? { sha: oldSha } : {}),
      content: ''
    });

    const prefix = beginning.slice(0, -2);
    const suffix = '"}';
    const body = videoCommitStream(request.body, prefix, suffix, encodedLength);

    const uploaded = await fetch(apiUrl.split('?')[0], {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body,
      duplex: 'half'
    });

    if (!uploaded.ok) {
      const code = uploaded.status;
      const message = code === 401 || code === 403 
        ? 'GitHub Token 無效或缺少 Contents 寫入權限。'
        : code === 409 ? '檔案剛被更新產生衝突，請重新整理後再試。'
        : code === 404 ? '找不到指定的 GitHub 倉庫或目錄分支。'
        : `GitHub 更新失敗 (HTTP ${code})。`;
      return response({ error: message }, 502);
    }

    return response({ ok: true, videoPath: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${HOME_VIDEO_FILE_PATH}` });
  } catch (error) {
    return response({ error: '連線 GitHub 處理失敗：' + error.message }, 502);
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
