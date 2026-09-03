const http = require("http");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const port = Number(process.env.PORT || 3000);
const publicRoot = __dirname;
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE || "roadmap",
  user: process.env.MYSQL_USER || "roadmap",
  password: process.env.MYSQL_PASSWORD || "roadmap_password",
  waitForConnections: true,
  connectionLimit: 5
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/api/checked-tasks" && request.method === "GET") return await getCheckedTasks(response);
    if (request.url === "/api/checked-tasks" && request.method === "PUT") return await replaceCheckedTasks(request, response);
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    return serveStatic(request.url, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

async function getCheckedTasks(response) {
  const [rows] = await pool.query("SELECT sha256 FROM checked_tasks ORDER BY sha256");
  sendJson(response, 200, { checked_tasks: rows.map((row) => row.sha256) });
}

async function replaceCheckedTasks(request, response) {
  const body = await readJson(request);
  const hashes = Array.isArray(body.checked_tasks) ? [...new Set(body.checked_tasks)] : null;
  if (!hashes || hashes.some((hash) => !/^[a-f0-9]{64}$/i.test(hash))) {
    return sendJson(response, 400, { error: "checked_tasks must be an array of SHA-256 hashes" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM checked_tasks");
    if (hashes.length) await connection.query("INSERT INTO checked_tasks (sha256) VALUES ?", [hashes.map((hash) => [hash.toLowerCase()])]);
    await connection.commit();
    sendJson(response, 200, { checked_tasks: hashes.map((hash) => hash.toLowerCase()) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function serveStatic(requestUrl, response) {
  const requestedPath = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) return sendJson(response, 400, { error: "Invalid path" });

  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, 404, { error: "Not found" });
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream", "Cache-Control": extension === ".json" ? "no-store" : "public, max-age=3600" });
    response.end(content);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

server.listen(port, () => console.log(`Roadmap app listening on port ${port}`));
