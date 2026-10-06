// A tiny static file server (no dependencies) so browsers can load the ES modules over http.
// Usage: npm start   (then open the address it prints). Set PORT to use a different port.
// It also accepts match logs from the game (POST /match-log/<match id>) and saves them in playtest-logs/, so a
// playtest can be looked at afterwards. Only requests from this computer are accepted.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const playtestLogFolder = join(projectRoot, 'playtest-logs');
const port = Number(process.env.PORT) || 8080;
const largestMatchLogBytes = 10 * 1024 * 1024;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function isFromThisComputer(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
}

async function saveMatchLog(request, response, matchId) {
  if (!isFromThisComputer(request) || !/^[a-z0-9-]{1,64}$/.test(matchId)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > largestMatchLogBytes) {
      response.writeHead(413).end('Too large');
      return;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    JSON.parse(body);
  } catch (error) {
    response.writeHead(400).end('Not JSON');
    return;
  }
  await mkdir(playtestLogFolder, { recursive: true });
  await writeFile(join(playtestLogFolder, `${matchId}.json`), body);
  response.writeHead(204).end();
}

http.createServer(async (request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const matchLogPath = requestedPath.match(/^\/match-log\/([^/]+)$/);
  if (request.method === 'POST' && matchLogPath) {
    await saveMatchLog(request, response, matchLogPath[1]);
    return;
  }
  const relativePath = requestedPath.endsWith('/') ? `${requestedPath}index.html` : requestedPath;
  const filePath = normalize(join(projectRoot, relativePath));
  if (!filePath.startsWith(projectRoot)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch (error) {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving ${projectRoot}\nPlay: http://localhost:${port}/`));
