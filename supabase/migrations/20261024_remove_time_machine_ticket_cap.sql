BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

-- Tickets have no product-level holding cap; balances must remain nonnegative.
ALTER TABLE private.time_machine_wallets
 DROP CONSTRAINT time_machine_wallets_balance_check,
 ADD CONSTRAINT time_machine_wallets_balance_check CHECK (balance >= 0);
ALTER TABLE private.time_machine_ticket_events
 DROP CONSTRAINT time_machine_ticket_events_balance_after_check,
 ADD CONSTRAINT time_machine_ticket_events_balance_after_check CHECK (balance_after >= 0);

COMMIT;
