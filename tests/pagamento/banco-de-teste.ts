import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Um Postgres em memória com as migrations REAIS, em ordem. Só o que o Supabase
 * traz pronto é simulado aqui: papéis, `auth`, `vault`, `storage` e `cron`.
 */
const STUBS = `
  create role anon; create role authenticated; create role service_role; create role authenticator;
  create role supabase_admin; create role supabase_auth_admin; create role dashboard_user;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    raw_app_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;

  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);
  create schema extensions;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;

  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(p_nome text, p_agenda text, p_comando text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (p_nome, p_agenda, p_comando)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
    returning jobid
  $$;
  create function cron.unschedule(p_nome text) returns boolean language sql as $$
    delete from cron.job where jobname = p_nome returning true
  $$;
`;

const PASTA = join(process.cwd(), "supabase", "migrations");

export const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";

export function migrations(): string[] {
  return readdirSync(PASTA).filter((a) => a.endsWith(".sql")).sort();
}

export async function bancoDeTeste(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const arquivo of migrations()) {
    try {
      await db.exec(readFileSync(join(PASTA, arquivo), "utf8"));
    } catch (erro) {
      throw new Error(`${arquivo}: ${erro instanceof Error ? erro.message : erro}`);
    }
  }
  await db.query("insert into vault.decrypted_secrets (name, decrypted_secret) values ('florenza_pagamentos', $1)", [SEGREDO]);
  return db;
}
