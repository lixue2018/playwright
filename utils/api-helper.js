const { API_BASE_URL, CLIENT_ID } = require('./env');

async function fetchAccessToken(request, itCode) {
  const response = await request.post(`${API_BASE_URL}/auth/login/token`, {
    data: {
      clientId: CLIENT_ID,
      grantType: 'itCode',
      code: '',
      uuid: '',
      itCode,
    },
    headers: {
      Accept: 'application/json, text/plain, */*',
      clientId: CLIENT_ID,
      'client-type': 'client',
      'X-Requested-With': 'XMLHttpRequest',
    },
    ignoreHTTPSErrors: true,
  });

  const body = await response.json().catch(() => ({}));
  const token = (body.data && (body.data.access_token || body.data.token)) || '';

  if (!response.ok() || !token) {
    throw new Error(
      `登录失败 itCode=${itCode} http=${response.status()} body=${JSON.stringify(body).slice(0, 400)}`,
    );
  }
  return String(token);
}

function authHeaders(token) {
  return {
    Accept: 'application/json, text/plain, */*',
    clientId: CLIENT_ID,
    'client-type': 'client',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: token.startsWith('Bearer') ? token : `Bearer ${token}`,
  };
}

/** Pinia persist key = Portal-Token，paths=['token'] → {"token":"..."} */
async function injectFrontAuth(page, token) {
  const blob = JSON.stringify({ token });
  await page.addInitScript(
    ({ blobJson, rawToken }) => {
      window.localStorage.setItem('Portal-Token', blobJson);
      document.cookie = `Portal-Authorization=${rawToken}; path=/`;
      document.cookie = `Authorization=Bearer ${rawToken}; path=/`;
    },
    { blobJson: blob, rawToken: token },
  );
}

/** 后台 vueuse useStorage('Admin-Token') 默认 JSON 序列化 */
async function injectAdminAuth(page, token) {
  await page.addInitScript(
    ({ rawToken }) => {
      window.localStorage.setItem('Admin-Token', JSON.stringify(rawToken));
      document.cookie = `Admin-Authorization=${rawToken}; path=/`;
      document.cookie = `Admin-Authorization=${rawToken}; path=/admin`;
      document.cookie = `Authorization=Bearer ${rawToken}; path=/`;
    },
    { rawToken: token },
  );
}

async function saveFrontStorageState(page, request, itCode, filePath) {
  const token = await fetchAccessToken(request, itCode);
  await injectFrontAuth(page, token);
  return token;
}

async function saveAdminStorageState(page, request, itCode, filePath) {
  const token = await fetchAccessToken(request, itCode);
  await injectAdminAuth(page, token);
  return token;
}

module.exports = {
  fetchAccessToken,
  authHeaders,
  injectFrontAuth,
  injectAdminAuth,
  saveFrontStorageState,
  saveAdminStorageState,
};
