const { spawn } = require("child_process");

function runNodeScript(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function main() {
  try {
    await runNodeScript([
      "./node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
    ], "prisma migrate deploy");

    await runNodeScript([
      "./node_modules/next/dist/bin/next",
      "start",
    ], "next start");
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}

main();
