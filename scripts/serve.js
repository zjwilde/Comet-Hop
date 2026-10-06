// A tiny static file server (no dependencies) so browsers can load the ES modules over http.
// Usage: npm start   (then open the address it prints). Set PORT to use a different port.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer(async (request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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
