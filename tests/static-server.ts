import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const host = "127.0.0.1";
const port = 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function safePath(pathname: string) {
  const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const candidate = resolve(root, relative);

  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) {
    return null;
  }

  return candidate;
}

async function findFile(pathname: string) {
  const candidate = safePath(pathname);
  if (!candidate) return null;

  const attempts = extname(candidate)
    ? [candidate]
    : [join(candidate, "index.html"), `${candidate}.html`];

  for (const attempt of attempts) {
    try {
      if ((await stat(attempt)).isFile()) return attempt;
    } catch {
      // Try the next static-file shape.
    }
  }

  return null;
}

export async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "POST" && requestUrl.pathname === "/api/contact") {
      request.resume();
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ ok: true, message: "Thanks. Your message has been received." }));
      return;
    }

    const file = await findFile(requestUrl.pathname);
    const status = file ? 200 : 404;
    const responseFile = file ?? join(root, "404.html");

    response.writeHead(status, {
      "Content-Type": contentTypes.get(extname(responseFile)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(responseFile).pipe(response);
  });

  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolveListening);
  });

  return server;
}

export async function stopStaticServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosed()));
  });
}
