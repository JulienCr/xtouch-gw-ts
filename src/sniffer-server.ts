import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { logger } from "./logger";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const PORT = Number(process.env.SNIFFER_PORT ?? 8123);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveFile(filePath: string, res: http.ServerResponse): void {
  const ext = path.extname(filePath).toLowerCase();
  const ctype = CONTENT_TYPES[ext] ?? "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", ctype);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url === "/" || url === "/index.html") {
    return serveFile(path.join(PUBLIC_DIR, "sniffer.html"), res);
  }
  const safePath = path.normalize(url).replace(/^\/+/, "");
  const target = path.join(PUBLIC_DIR, safePath);
  if (!target.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  serveFile(target, res);
});

export function startSnifferServer(): http.Server {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  server.listen(PORT, () => {
    logger.info(`Sniffer Web MIDI: http://localhost:${PORT}/`);
  });
  return server;
}

const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try { 
    // Alternative à import.meta.url pour la compatibilité
    return entry.endsWith("sniffer-server.ts") || entry.endsWith("sniffer-server.js");
  } catch { return false; }
})();

if (isMain) {
  startSnifferServer();
}
