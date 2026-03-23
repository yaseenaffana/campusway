/*

  Deprecated compatibility file.

  The canonical schema bootstrap for the active backend now lives in:
    backend/create_table.sql

  This file intentionally does not define its own schema anymore, so the
  repository has a single source of truth for database structure.
*/

PRINT 'Deprecated script: use backend/create_table.sql for the active MZSJS BUZZ schema.';
