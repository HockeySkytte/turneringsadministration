const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNodeScript(args, label, opts) {
  return new Promise((resolve, reject) => {
    const options = opts ?? {};
    const captureOutput = Boolean(options.captureOutput);
    const env = options.env ?? process.env;

    const child = spawn(process.execPath, args, {
      stdio: ["inherit", captureOutput ? "pipe" : "inherit", captureOutput ? "pipe" : "inherit"],
      env,
    });

    let stdout = "";
    let stderr = "";
    if (captureOutput) {
      if (child.stdout) {
        child.stdout.on("data", (buf) => {
          const s = buf.toString();
          stdout += s;
          process.stdout.write(buf);
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (buf) => {
          const s = buf.toString();
          stderr += s;
          process.stderr.write(buf);
        });
      }
    }

    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const output = captureOutput ? `\n${stdout}${stderr}` : "";
      reject(new Error(`${label} exited with code ${code}${output}`));
    });
  });
}

function runCommand(command, args, label, opts) {
  return new Promise((resolve, reject) => {
    const options = opts ?? {};
    const captureOutput = Boolean(options.captureOutput);
    const env = options.env ?? process.env;

    const child = spawn(command, args, {
      stdio: ["inherit", captureOutput ? "pipe" : "inherit", captureOutput ? "pipe" : "inherit"],
      env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    if (captureOutput) {
      if (child.stdout) {
        child.stdout.on("data", (buf) => {
          const s = buf.toString();
          stdout += s;
          process.stdout.write(buf);
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (buf) => {
          const s = buf.toString();
          stderr += s;
          process.stderr.write(buf);
        });
      }
    }

    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const output = captureOutput ? `\n${stdout}${stderr}` : "";
      reject(new Error(`${label} exited with code ${code}${output}`));
    });
  });
}

async function bestEffortKillPrismaEngines() {
  if (!IS_WIN) return;

  // If a previous dev server is still running, Prisma's query engine can be locked,
  // causing `prisma generate` EPERM on rename in node_modules\.prisma\client.
  // Best-effort terminate only the query engine process.
  const candidates = [
    "query-engine-windows.exe",
    "query_engine-windows.exe",
  ];

  for (const imageName of candidates) {
    try {
      // taskkill returns non-zero if the process isn't running; ignore.
      // Use stdio=ignore to avoid log noise like "process not found".
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve, reject) => {
        const child = spawn("taskkill", ["/IM", imageName, "/F"], {
          stdio: ["ignore", "ignore", "ignore"],
          windowsHide: true,
        });
        child.on("error", (err) => reject(err));
        child.on("exit", () => resolve());
      });
    } catch {
      // ignore
    }
  }
}

async function cleanupNextDevLock() {
  const lockPath = path.join(process.cwd(), ".next", "dev", "lock");
  try {
    await fs.promises.access(lockPath);
  } catch {
    return;
  }

  try {
    // If the file is stale (left over after a crash), it can be deleted.
    // If another next dev is running, Windows typically refuses deletion (EPERM).
    await fs.promises.unlink(lockPath);
    // eslint-disable-next-line no-console
    console.warn("[dev] Removed stale Next.js dev lock (.next/dev/lock).");
  } catch (err) {
    const msg = String(err?.message ?? err);
    // eslint-disable-next-line no-console
    console.error(
      `[dev] Next.js dev lock exists and could not be removed. Another instance of next dev is likely running. (${msg})`,
    );
    // Give a crisp, actionable hint.
    // eslint-disable-next-line no-console
    console.error("[dev] Stop the other dev server (or reboot), then run `npm run dev` again.");
    process.exit(1);
  }
}

async function runWithRetries(fn, {
  label,
  retries = 5,
  baseDelayMs = 250,
  shouldRetry,
}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const retry = attempt < retries && (shouldRetry ? shouldRetry(err) : false);
      if (!retry) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      // eslint-disable-next-line no-console
      console.warn(`[dev] ${label} failed (${attempt}/${retries}): ${msg}`);
      // eslint-disable-next-line no-console
      console.warn(`[dev] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function main() {
  try {
    await runNodeScript([
      "./node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
    ], "prisma migrate deploy");

    // Windows + OneDrive/AV can lock the Prisma Node-API engine during rename.
    // In dev, prefer the binary engine to avoid query_engine-windows.dll.node rename EPERM.
    const prismaDevEnv = IS_WIN
      ? { ...process.env, PRISMA_CLIENT_ENGINE_TYPE: process.env.PRISMA_CLIENT_ENGINE_TYPE ?? "binary" }
      : process.env;

    await runWithRetries(
      () =>
        (async () => {
          await bestEffortKillPrismaEngines();
          return runNodeScript(
            ["./node_modules/prisma/build/index.js", "generate"],
            "prisma generate",
            { captureOutput: true, env: prismaDevEnv },
          );
        })(),
      {
        label: "prisma generate",
        retries: 10,
        baseDelayMs: 500,
        shouldRetry: (err) => {
          const msg = String(err?.message ?? err);
          return (
            msg.includes("EPERM") &&
            (
              // Node-API engine
              msg.includes("query_engine-windows.dll.node") ||
              msg.includes("query_engine-windows.dll.node.tmp") ||
              // Binary engine
              msg.includes("query-engine-windows.exe") ||
              msg.includes("query-engine-windows.exe.tmp")
            )
          );
        },
      }
    );

    const bundler = (process.env.NEXT_DEV_BUNDLER ?? "webpack").toLowerCase();
    const bundlerArgs =
      bundler === "turbopack" || bundler === "turbo" ? ["--turbo"] : ["--webpack"];

    await cleanupNextDevLock();

    await runNodeScript([
      "./node_modules/next/dist/bin/next",
      "dev",
      ...bundlerArgs,
    ], "next dev", { env: prismaDevEnv });
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}

main();
