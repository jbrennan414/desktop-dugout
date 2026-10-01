import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIRMWARES_DIR = resolve(HERE, "..", "firmwares");

const DEFAULTS = {
  bucket: "desktopdugout-firmware",
  param: "/desktop-dugout/firmware/latest",
};

const FIRMWARE_NAME_RE = /^firmware_(\d+\.\d+\.\d+)\.bin$/;

interface Args {
  file?: string;
  version?: string;
  bucket: string;
  param: string;
}

interface FirmwareFile {
  file: string;
  version: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const chosen = args.file
    ? { file: resolve(args.file), version: args.version ?? parseVersionFromName(args.file) }
    : findLatestInFirmwaresDir();

  const size = statSync(chosen.file).size;
  log(`file:    ${basename(chosen.file)} (${size} bytes)`);
  log(`version: ${chosen.version}`);
  log(`bucket:  ${args.bucket}`);
  log(`param:   ${args.param}`);
  log("");

  const sha256 = await computeSha256(chosen.file);
  log(`sha256:  ${sha256}`);

  const key = `firmware/${chosen.version}.bin`;
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: key,
      Body: createReadStream(chosen.file),
      ContentType: "application/octet-stream",
      ContentLength: size,
      Metadata: { sha256, version: chosen.version },
    }),
  );
  log(`uploaded s3://${args.bucket}/${key}`);

  const ssm = new SSMClient({});
  await ssm.send(
    new PutParameterCommand({
      Name: args.param,
      Value: JSON.stringify({ version: chosen.version, sha256 }),
      Type: "String",
      Overwrite: true,
    }),
  );
  log(`pointer updated: ${args.param} → ${chosen.version}`);
  log("");
  log("Devices will pick this up on their next GET /firmware/latest.");
}

function findLatestInFirmwaresDir(): FirmwareFile {
  let entries: string[];
  try {
    entries = readdirSync(FIRMWARES_DIR);
  } catch (err) {
    fatal(`Cannot read ${FIRMWARES_DIR}: ${(err as Error).message}`);
  }

  const candidates: FirmwareFile[] = [];
  for (const name of entries) {
    const match = FIRMWARE_NAME_RE.exec(name);
    if (match?.[1]) {
      candidates.push({ file: join(FIRMWARES_DIR, name), version: match[1] });
    }
  }

  if (candidates.length === 0) {
    fatal(
      `No firmware_<version>.bin files in ${FIRMWARES_DIR}. ` +
        `Drop a file like firmware_1.0.0.bin there and re-run.`,
    );
  }

  candidates.sort((a, b) => compareSemver(b.version, a.version));
  return candidates[0]!;
}

function parseVersionFromName(filepath: string): string {
  const name = basename(filepath);
  const match = FIRMWARE_NAME_RE.exec(name);
  if (!match?.[1]) {
    fatal(
      `Cannot parse version from ${name}. ` +
        `Expected firmware_<major>.<minor>.<patch>.bin, or pass --version explicitly.`,
    );
  }
  return match[1];
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === "-h" || token === "--help") {
      printUsage();
      process.exit(0);
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) fatal(`--${key} requires a value`);
      out[key] = value!;
      i++;
    }
  }
  return {
    file: out.file,
    version: out.version,
    bucket: out.bucket ?? DEFAULTS.bucket,
    param: out.param ?? DEFAULTS.param,
  };
}

function computeSha256(path: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolveHash(hash.digest("hex")))
      .on("error", rejectHash);
  });
}

function printUsage(): void {
  process.stderr.write(
    `Usage: npm run publish-firmware [-- --file <path>] [--version <semver>] [--bucket <name>] [--param <name>]\n\n` +
      `Default: auto-discovers the highest-semver firmware_<x.y.z>.bin in backend/firmwares/,\n` +
      `uploads it to S3, and atomically flips the "latest" pointer in SSM.\n\n` +
      `Order of operations: hash → S3 put → SSM put. A mid-flight failure leaves the\n` +
      `pointer on the previous version, so devices never see a broken URL.\n\n` +
      `Overrides:\n` +
      `  --file <path>       explicit path to a .bin (skips auto-discovery)\n` +
      `  --version <semver>  explicit version (default: parsed from filename)\n` +
      `  --bucket <name>     S3 bucket           (default: ${DEFAULTS.bucket})\n` +
      `  --param <name>      SSM parameter name  (default: ${DEFAULTS.param})\n\n`,
  );
}

function log(msg: string): void {
  process.stdout.write(msg + "\n");
}

function fatal(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(`\nfailed: ${(err as Error).message ?? err}\n`);
  process.exit(1);
});
