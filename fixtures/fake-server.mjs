import http from "node:http";

const status = Number(process.env.FAKE_STATUS ?? "200");
const port = Number(process.env.PORT ?? "0");
const host = process.env.HOSTNAME ?? "127.0.0.1";

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fake Scotty</title>
  </head>
  <body>
    <h1 id="fixture">fake scotty server</h1>
    <a id="external" href="https://example.com/">external</a>
  </body>
</html>
`;

const server = http.createServer((request, response) => {
  if (request.url === "/") {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

server.listen(port, host, () => {
  console.log(`fake-server listening on http://${host}:${server.address().port}/`);
});

const exitAfterMs = Number(process.env.FAKE_EXIT_AFTER_MS ?? "0");
if (exitAfterMs > 0) {
  setTimeout(() => process.exit(1), exitAfterMs);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}