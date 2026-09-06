-- Creates the dedicated test database deterministically on the first
-- container start against an empty data volume (docker-entrypoint-initdb.d
-- runs scripts here exactly once, only when the data directory is empty).
-- See docs/adr/006-persistence-and-local-infrastructure.md ("Infraestrutura
-- local") for the full rationale.
--
-- The PostGIS extension is intentionally NOT created here — that belongs to
-- the Prisma migration introduced in Tarefa 3.2, not to this init script.
CREATE DATABASE mockp_test;
