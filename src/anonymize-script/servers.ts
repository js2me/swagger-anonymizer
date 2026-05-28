// @ts-nocheck

function isLocalhostUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  } catch {
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(url);
  }
}

/** Маскирует non-localhost URL в `servers[].url`, pathname и search сохраняются. */
export function anonymizeServerUrls(doc) {
  if (!doc || !Array.isArray(doc.servers)) return;
  for (const server of doc.servers) {
    if (!server || typeof server !== 'object' || typeof server.url !== 'string') {
      continue;
    }
    if (isLocalhostUrl(server.url)) continue;
    try {
      const u = new URL(server.url);
      u.protocol = u.protocol || 'https:';
      u.hostname = 'api.example.invalid';
      u.username = '';
      u.password = '';
      server.url = u.toString();
    } catch {
      server.url = 'https://api.example.invalid';
    }
  }
}

export { isLocalhostUrl };
