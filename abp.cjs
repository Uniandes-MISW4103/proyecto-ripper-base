// Settings of the application under test (ABP): its URLs and administrator. In a team repository
// they come from the .env at the repository root (two folders up), shared with compose.yml and the
// other modules; variables already set in the environment take precedence. Outside a team
// repository the defaults below apply.
const fs = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const defaults = {
  ABP_URL: "http://localhost:2368",
  ABP_RC_URL: "http://localhost:2369",
  ABP_ADMIN_NAME: "Monitor Pruebas",
  ABP_ADMIN_EMAIL: "monitor@example.com",
  ABP_ADMIN_PASSWORD: "Misw4103-Pruebas",
};

module.exports = Object.fromEntries(
  Object.entries(defaults).map(([name, value]) => [name, process.env[name] ?? value]),
);
