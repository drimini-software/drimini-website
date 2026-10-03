import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const usage = `Drimini enquiry inbox

Usage:
  pnpm inbox list
  pnpm inbox all
  pnpm inbox show <id>
  pnpm inbox read <id>
  pnpm inbox archive <id>
  pnpm inbox restore <id>
  pnpm inbox delete <id> --confirm-delete

The command uses your authenticated Wrangler session and operates on the remote
drimini-contact D1 database. Deletion is permanent.`;

function requireIdentifier(value) {
  if (!value || !ID_PATTERN.test(value)) {
    throw new Error("A valid enquiry UUID is required.");
  }
  return value;
}

export function buildInboxQuery(argumentsList) {
  const [action = "list", rawId, confirmation] = argumentsList;

  switch (action) {
    case "list":
      return `SELECT id, created_at, status, company, name, email,
        substr(project, 1, 140) AS project_preview
        FROM contact_enquiries
        WHERE status != 'archived'
        ORDER BY created_at DESC
        LIMIT 100;`;
    case "all":
      return `SELECT id, created_at, status, company, name, email,
        substr(project, 1, 140) AS project_preview
        FROM contact_enquiries
        ORDER BY created_at DESC
        LIMIT 100;`;
    case "show": {
      const id = requireIdentifier(rawId);
      return `SELECT id, created_at, updated_at, status, name, email, company,
        role, project, timeline, budget, privacy_notice_version
        FROM contact_enquiries WHERE id = '${id}';`;
    }
    case "read": {
      const id = requireIdentifier(rawId);
      return `UPDATE contact_enquiries SET status = 'read',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = '${id}';`;
    }
    case "archive": {
      const id = requireIdentifier(rawId);
      return `UPDATE contact_enquiries SET status = 'archived',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = '${id}';`;
    }
    case "restore": {
      const id = requireIdentifier(rawId);
      return `UPDATE contact_enquiries SET status = 'read',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = '${id}';`;
    }
    case "delete": {
      const id = requireIdentifier(rawId);
      if (confirmation !== "--confirm-delete") {
        throw new Error("Permanent deletion requires --confirm-delete.");
      }
      return `DELETE FROM contact_enquiries WHERE id = '${id}';`;
    }
    case "help":
    case "--help":
    case "-h":
      return null;
    default:
      throw new Error(`Unknown inbox action: ${action}`);
  }
}

export function runInbox(argumentsList = process.argv.slice(2)) {
  let query;
  try {
    query = buildInboxQuery(argumentsList);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid inbox command.");
    console.error(usage);
    return 2;
  }

  if (!query) {
    console.log(usage);
    return 0;
  }

  const websiteDirectory = fileURLToPath(new URL("..", import.meta.url));
  const wranglerExecutable = fileURLToPath(
    new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      wranglerExecutable,
      "d1",
      "execute",
      "drimini-contact",
      "--remote",
      "--command",
      query,
    ],
    {
      cwd: websiteDirectory,
      stdio: "inherit",
      shell: false,
    },
  );

  if (result.error) {
    console.error(`Could not start Wrangler: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runInbox();
}
