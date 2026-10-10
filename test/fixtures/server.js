// Static server for the fixture application used by the integration tests.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

const root = new URL("./app/", import.meta.url).pathname;

/** Starts the server on a free port and returns its base URL and a close function. */
export async function startFixtureServer() {
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://localhost");
    const file = pathname === "/" ? "index.html" : pathname.slice(1);
    try {
      const body = await readFile(join(root, file));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}
