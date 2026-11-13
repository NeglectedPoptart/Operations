-- Migration 167: remove the "Pending to Load Follow-up" agent. The Orders Follow-up agent does the same job
-- better, so this one is gone from the Agents page and the code. Deleting the agent also deletes its emails,
-- replies and activity (they hang off it). Safe to re-run.

delete from agents where key = 'load_pending';
