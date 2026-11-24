/**
 * Gera supabase/setup_producao.sql: TODAS as migrations num arquivo só, seguro para rodar
 * de novo e em banco que já tem parte das tabelas (inclusive com colunas antigas).
 *
 *   node scripts/build-setup-sql.js
 *
 * O que o arquivo gerado faz, migration por migration:
 *  - CREATE TABLE IF NOT EXISTS como está, e logo depois ADD COLUMN IF NOT EXISTS de cada
 *    coluna (sem NOT NULL / PRIMARY KEY / UNIQUE, para não falhar em tabela com linhas).
 *    Assim uma tabela criada num formato antigo ganha as colunas que o código usa.
 *  - UNIQUE / CHECK / FOREIGN KEY da tabela viram índice único ou constraint com nome fixo
 *    (CHECK e FK como NOT VALID: não conferem as linhas antigas).
 *  - CREATE INDEX ganha IF NOT EXISTS; CREATE POLICY e CREATE TRIGGER são recriados.
 *  - Cada comando roda isolado: se um falhar, os outros continuam, e a lista de falhas
 *    aparece no resultado do SQL Editor no final. "Já existe" não conta como falha.
 *  - Colunas antigas NOT NULL que o código não conhece passam a aceitar vazio
 *    (senão os INSERT do código falham).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIG = path.join(ROOT, "supabase", "migrations");
const OUT = path.join(ROOT, "supabase", "setup_producao.sql");

/** Divide SQL em comandos, respeitando aspas, comentários e $tag$...$tag$. */
function splitSql(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const j = sql.indexOf("\n", i);
      i = j < 0 ? sql.length : j + 1;
      cur += "\n";
      continue;
    }
    if (two === "/*") {
      const j = sql.indexOf("*/", i + 2);
      i = j < 0 ? sql.length : j + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        const end = j < 0 ? sql.length : j + tag.length;
        cur += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Divide por vírgula no nível 0 de parênteses (fora de aspas). */
function splitTopLevel(s) {
  const parts = [];
  let d = 0, cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") q = !q;
    if (!q && ch === "(") d++;
    if (!q && ch === ")") d--;
    if (!q && ch === "," && d === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Tira NOT NULL, PRIMARY KEY e UNIQUE de uma definição de coluna. */
function relaxColumn(def) {
  return def
    .replace(/\bPRIMARY\s+KEY\b/gi, "")
    .replace(/\bNOT\s+NULL\b/gi, "")
    .replace(/\bUNIQUE\b(?!\s*\()/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const expected = {}; // tabela -> Set(colunas)
const steps = []; // { label, sql }

function addStep(label, sql) {
  steps.push({ label, sql });
}

const files = fs.readdirSync(MIG).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
for (const file of files) {
  const tag = file.replace(/\.sql$/, "");
  const raw = fs.readFileSync(path.join(MIG, file), "utf8").replace(/^﻿/, "");
  const stmts = splitSql(raw);
  let n = 0;
  for (let st of stmts) {
    n++;
    const label = `${tag} #${n}`;
    if (/^(BEGIN|COMMIT)$/i.test(st)) continue;

    const ct = st.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*)\)\s*$/i);
    if (ct) {
      const table = ct[1];
      const body = ct[2];
      addStep(label, st.replace(/^CREATE\s+TABLE\s+(?!IF)/i, "CREATE TABLE IF NOT EXISTS "));
      let k = 0;
      for (const part of splitTopLevel(body)) {
        if (/^(PRIMARY\s+KEY)\b/i.test(part)) continue;
        const uq = part.match(/^(?:CONSTRAINT\s+(\w+)\s+)?UNIQUE\s*(NULLS\s+NOT\s+DISTINCT\s*)?\(([^)]+)\)/i);
        if (uq) {
          const cols = uq[3].split(",").map((x) => x.trim());
          const name = uq[1] || `${table}_${cols.join("_")}_key`;
          const nnd = uq[2] ? " NULLS NOT DISTINCT" : "";
          addStep(`${label} unique`, `CREATE UNIQUE INDEX IF NOT EXISTS ${name.slice(0, 63)} ON public.${table} (${cols.join(", ")})${nnd}`);
          continue;
        }
        const chk = part.match(/^(?:CONSTRAINT\s+(\w+)\s+)?(CHECK|FOREIGN\s+KEY)\b([\s\S]*)$/i);
        if (chk) {
          k++;
          const name = chk[1] || `atm_${table}_c${k}`;
          addStep(`${label} constraint`, `ALTER TABLE public.${table} ADD CONSTRAINT ${name} ${chk[2]}${chk[3]} NOT VALID`);
          continue;
        }
        if (/^(CONSTRAINT|EXCLUDE)\b/i.test(part)) continue;
        const col = part.split(/\s+/)[0].replace(/"/g, "");
        (expected[table] ||= new Set()).add(col);
        addStep(`${label} coluna ${col}`, `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${relaxColumn(part)}`);
        if (/\bUNIQUE\b(?!\s*\()/i.test(part)) {
          // mesmo nome que o Postgres dá ao UNIQUE da coluna: em banco novo não duplica
          addStep(`${label} unique ${col}`, `CREATE UNIQUE INDEX IF NOT EXISTS ${`${table}_${col}_key`.slice(0, 63)} ON public.${table} (${col})`);
        }
      }
      continue;
    }

    for (const m of st.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s+([\s\S]*)/gi)) {
      for (const a of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) (expected[m[1]] ||= new Set()).add(a[1]);
    }

    let sql = st;
    sql = sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, (_, u) => `CREATE ${u || ""}INDEX IF NOT EXISTS `);
    const pol = sql.match(/^CREATE\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+([\w.]+)/i);
    if (pol) addStep(`${label} (recria policy)`, `DROP POLICY IF EXISTS ${pol[1]} ON ${pol[2]}`);
    const trg = sql.match(/^CREATE\s+TRIGGER\s+(\w+)[\s\S]*?\bON\s+([\w.]+)/i);
    if (trg) addStep(`${label} (recria trigger)`, `DROP TRIGGER IF EXISTS ${trg[1]} ON ${trg[2]}`);
    addStep(label, sql);
  }
}

if (steps.some((s) => s.sql.includes("$atm_sql$"))) throw new Error("Um comando contém $atm_sql$; troque o delimitador.");

const expectedList = Object.entries(expected)
  .map(([t, cols]) => `('${t}', ARRAY[${[...cols].map((c) => `'${c}'`).join(", ")}])`)
  .join(",\n  ");

const header = `-- =====================================================================
-- ATM - SETUP COMPLETO DO BANCO (gerado por scripts/build-setup-sql.js, não editar à mão)
-- Gerado a partir de ${files.length} migrations: ${files[0]} até ${files[files.length - 1]}
-- =====================================================================
-- Como usar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Pode rodar em banco vazio, em banco com parte das tabelas e quantas vezes quiser.
-- No fim aparece uma tabela: "tudo certo" ou a lista do que falhou (com o erro).
-- =====================================================================

CREATE TEMP TABLE IF NOT EXISTS atm_setup_falhas (passo TEXT, erro TEXT, comando TEXT);
TRUNCATE atm_setup_falhas;

CREATE OR REPLACE FUNCTION pg_temp.atm_exec(passo TEXT, comando TEXT) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE comando;
EXCEPTION
  -- já existe: tudo bem
  WHEN duplicate_object OR duplicate_table OR duplicate_column OR duplicate_function OR duplicate_schema THEN
    NULL;
  WHEN OTHERS THEN
    INSERT INTO atm_setup_falhas VALUES (passo, SQLSTATE || ': ' || SQLERRM, left(comando, 300));
END;
$fn$;
`;

const body = steps
  .map((s) => `SELECT pg_temp.atm_exec('${s.label.replace(/'/g, "''")}', $atm_sql$${s.sql}$atm_sql$);`)
  .join("\n");

const footer = `

-- Colunas antigas NOT NULL que o código não conhece passam a aceitar vazio (senão os INSERT falham).
DO $relax$
DECLARE r RECORD;
BEGIN
  FOR r IN
    WITH esperado(tabela, colunas) AS (VALUES
  ${expectedList}
    )
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN esperado e ON e.tabela = c.table_name
    WHERE c.table_schema = 'public'
      AND c.is_nullable = 'NO'
      AND c.column_default IS NULL
      AND NOT (c.column_name = ANY (e.colunas))
  LOOP
    PERFORM pg_temp.atm_exec('coluna antiga ' || r.table_name || '.' || r.column_name,
      format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name));
  END LOOP;
END
$relax$;

-- A API do Supabase passa a enxergar as tabelas e colunas novas na hora.
NOTIFY pgrst, 'reload schema';

SELECT passo, erro, comando FROM atm_setup_falhas
UNION ALL
SELECT 'tudo certo', 'nenhuma falha', NULL WHERE NOT EXISTS (SELECT 1 FROM atm_setup_falhas);
`;

fs.writeFileSync(OUT, header + "\n" + body + footer);
console.log(`OK: ${path.relative(ROOT, OUT)} (${steps.length} comandos de ${files.length} migrations)`);
