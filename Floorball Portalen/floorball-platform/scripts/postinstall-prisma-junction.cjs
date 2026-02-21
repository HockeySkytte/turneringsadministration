const fs = require("fs");
const path = require("path");

function exists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

const root = process.cwd();
const src = path.join(root, "node_modules", ".prisma");
const dest = path.join(root, "node_modules", "@prisma", "client", ".prisma");

if (!exists(src)) process.exit(0);
if (exists(dest)) {
  try {
    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) process.exit(0);
  } catch {
    // ignore
  }

  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

try {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(src, dest, "junction");
  // eslint-disable-next-line no-console
  console.log(`Created Prisma junction: ${dest} -> ${src}`);
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn(
    "Could not create Prisma junction for @prisma/client. Prisma imports may fail until you rerun prisma generate.",
    err && err.message ? err.message : err
  );
}
