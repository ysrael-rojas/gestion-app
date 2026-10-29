#!/usr/bin/env node
// Utilidades de base de datos para gestion-app (SPEC 60).
//
//   node scripts/db.mjs export [--all] [--check] [--url <URL>] [--env-file <ruta>]
//   node scripts/db.mjs run -f <archivo.sql> [--url <URL>] [--env-file <ruta>]
//   node scripts/db.mjs query -c "<sql>" [--url <URL>] [--env-file <ruta>]
//
// `export` lee el historial real de migraciones desde
// supabase_migrations.schema_migrations (version, name, statements) y escribe en
// supabase/migrations/ los archivos que falten. No escribe nada en la base.
// Con `--check` no escribe archivos: informa la deriva entre el repo y la base y
// sale con código 1 si no coinciden (lo usa el CI).
//
// `run` ejecuta un archivo .sql completo dentro de una transacción y aborta en
// el primer error.
//
// `query` ejecuta una consulta de solo lectura e imprime el resultado en JSON.
//
// Las credenciales se leen de .env (o del --env-file indicado) y nunca se
// imprimen. URL por defecto: SUPABASE_DB_URL_PROD para export y
// SUPABASE_DB_URL_DEV para run.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = join("supabase", "migrations");

// ---------------------------------------------------------------------------
// Entorno
// ---------------------------------------------------------------------------

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function resolveUrl(env, explicitUrl, envKey) {
  const url = explicitUrl ?? process.env[envKey] ?? env[envKey];
  if (!url) {
    throw new Error(
      `Falta la URL de conexión: usa --url o define ${envKey} en el archivo de entorno.`,
    );
  }
  return url;
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

async function withClient(url, fn) {
  const hasSslMode = /[?&]sslmode=/.test(url);
  const client = new pg.Client({
    connectionString: url,
    // Supabase exige TLS. El pooler usa un certificado propio, así que no se
    // valida la cadena (mismo criterio que el CLI de Supabase).
    ssl: hasSslMode ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return "(URL no parseable)";
  }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

function localMigrationVersions() {
  if (!existsSync(MIGRATIONS_DIR)) return new Map();
  const files = new Map();
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith(".sql")) continue;
    const version = file.split("_")[0];
    files.set(version, file);
  }
  return files;
}

function statementsToSql(statements) {
  if (!Array.isArray(statements) || statements.length === 0) return null;
  return (
    statements
      .map((s) => String(s).trim().replace(/;+$/, ""))
      .filter(Boolean)
      .join(";\n\n") + ";\n"
  );
}

async function exportMigrations({ url, all, check }) {
  const local = localMigrationVersions();

  const result = await withClient(url, (client) =>
    client.query(
      "select version, name, statements from supabase_migrations.schema_migrations order by version",
    ),
  );

  const rows = result.rows;
  const remoteVersions = new Set(rows.map((r) => r.version));
  const written = [];
  const missing = [];
  const kept = [];
  const withoutSql = [];

  if (!check && !existsSync(MIGRATIONS_DIR)) {
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  for (const row of rows) {
    const sql = statementsToSql(row.statements);
    const fileName = `${row.version}_${row.name}.sql`;
    const target = join(MIGRATIONS_DIR, fileName);
    const exists = existsSync(target);

    if (!sql) withoutSql.push(row.version);
    if (!exists) missing.push(fileName);

    if (check) continue;

    if (!sql) {
      if (!exists) {
        writeFileSync(
          target,
          `-- ${row.version} ${row.name}\n-- ATENCIÓN: la base no guardó el SQL de esta migración.\n-- Hay que recuperarlo a mano antes de confiar en un replay completo.\n`,
          "utf8",
        );
        written.push(`${fileName} (sin statements)`);
      }
      continue;
    }

    if (exists && !all) {
      kept.push(fileName);
      continue;
    }

    writeFileSync(target, sql, "utf8");
    written.push(fileName);
  }

  const orphans = [...local.entries()]
    .filter(([version]) => !remoteVersions.has(version))
    .map(([, file]) => file)
    .sort();

  console.log(`Origen: ${describeTarget(url)}`);
  console.log(`Versiones en la base: ${rows.length}`);
  console.log(`Archivos en el repo:  ${local.size}`);

  if (check) {
    if (missing.length > 0) {
      console.log(`\nFaltan en el repo (${missing.length}):`);
      for (const file of missing) console.log(`  + ${file}`);
    }
    if (withoutSql.length > 0) {
      console.log(`\nSin SQL en la base (${withoutSql.length}): ${withoutSql.join(", ")}`);
    }
    if (orphans.length > 0) {
      console.log(`\nArchivos locales sin versión en la base (${orphans.length}):`);
      for (const file of orphans) console.log(`  - ${file}`);
    }

    const drift = missing.length + orphans.length;
    if (drift > 0) {
      console.log(`\n✖ Deriva detectada: ${drift} archivo(s). El repo y la base no coinciden.`);
      process.exitCode = 1;
    } else {
      console.log("\n✔ Sin deriva: el repo coincide con el historial de la base.");
    }
    return;
  }

  console.log(`Archivos escritos:    ${written.length}`);
  for (const file of written) console.log(`  + ${file}`);
  console.log(`Archivos ya presentes: ${kept.length}`);
  console.log(`Faltaban en el repo:   ${missing.length}`);

  if (withoutSql.length > 0) {
    console.log(`\n⚠️  Sin SQL en la base (${withoutSql.length}): ${withoutSql.join(", ")}`);
  }

  if (orphans.length > 0) {
    console.log(`\n⚠️  Archivos locales sin versión en la base (${orphans.length}):`);
    for (const file of orphans) console.log(`  - ${file}`);
    console.log("   Son duplicados con otro timestamp: hay que eliminarlos.");
  } else {
    console.log("\nSin archivos huérfanos.");
  }
}

async function runFile({ url, file }) {
  if (!file) throw new Error("Falta -f <archivo.sql>.");
  if (!existsSync(file)) throw new Error(`No existe el archivo: ${file}`);

  const sql = readFileSync(file, "utf8");
  if (!sql.trim()) throw new Error(`El archivo está vacío: ${file}`);

  const bytes = Buffer.byteLength(sql, "utf8");
  console.log(`Destino: ${describeTarget(url)}`);
  console.log(`Archivo: ${file} (${bytes} bytes)`);

  await withClient(url, async (client) => {
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });

  console.log("OK: ejecutado y confirmado en una sola transacción.");
}

async function runQuery({ url, sql }) {
  if (!sql) throw new Error("Falta -c \"<sql>\".");

  const result = await withClient(url, (client) => client.query(sql));
  const sets = Array.isArray(result) ? result : [result];

  console.log(`Destino: ${describeTarget(url)}`);
  for (const set of sets) {
    if (!set.rows) continue;
    console.log(JSON.stringify(set.rows, null, 2));
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    mode: argv[0],
    all: false,
    check: false,
    url: undefined,
    file: undefined,
    sql: undefined,
    envFile: ".env",
  };
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--all") args.all = true;
    else if (token === "--check") args.check = true;
    else if (token === "--url") args.url = argv[++i];
    else if (token === "-f" || token === "--file") args.file = argv[++i];
    else if (token === "-c" || token === "--sql") args.sql = argv[++i];
    else if (token === "--env-file") args.envFile = argv[++i];
    else throw new Error(`Argumento desconocido: ${token}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnvFile(args.envFile);

  if (args.mode === "export") {
    const url = resolveUrl(env, args.url, "SUPABASE_DB_URL_PROD");
    await exportMigrations({ url, all: args.all, check: args.check });
    return;
  }

  if (args.mode === "run") {
    const url = resolveUrl(env, args.url, "SUPABASE_DB_URL_DEV");
    await runFile({ url, file: args.file });
    return;
  }

  if (args.mode === "query") {
    const url = resolveUrl(env, args.url, "SUPABASE_DB_URL_DEV");
    await runQuery({ url, sql: args.sql });
    return;
  }

  console.error("Uso:");
  console.error("  node scripts/db.mjs export [--all] [--check] [--url <URL>] [--env-file <ruta>]");
  console.error("  node scripts/db.mjs run -f <archivo.sql> [--url <URL>] [--env-file <ruta>]");
  console.error('  node scripts/db.mjs query -c "<sql>" [--url <URL>] [--env-file <ruta>]');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
