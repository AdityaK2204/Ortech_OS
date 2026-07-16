-- =====================================================================
-- ORTECH OS — 0004: the Accountant role (enum value only)
-- Run this ALONE first: Postgres cannot add an enum value and use it in
-- the same transaction. 0005_accounts.sql depends on it.
-- =====================================================================

alter type user_role add value if not exists 'accountant';
