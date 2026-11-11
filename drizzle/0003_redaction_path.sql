-- Privacy erasure path: case_events stay append-only EXCEPT that message/payload/actor_id may be blanked inside a
-- transaction that explicitly sets orylo.redaction = 'on' (used only by the audited customer-erasure procedure).
-- Every structural column (ids, sequence, type, states, actor kind, visibility, timestamp) must stay identical, so the
-- shape of history is preserved and only personal content is removed. audit_events and outcome_ledger remain fully immutable.
-- NOTE: the case_events columns are only referenced inside the nested IF, so this function works for every table it guards.
CREATE OR REPLACE FUNCTION orylo_block_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'case_events' THEN
    IF current_setting('orylo.redaction', true) = 'on'
       AND NEW.id = OLD.id AND NEW.organization_id = OLD.organization_id AND NEW.case_id = OLD.case_id
       AND NEW.seq = OLD.seq AND NEW.type = OLD.type AND NEW.actor_type = OLD.actor_type
       AND NEW.from_state IS NOT DISTINCT FROM OLD.from_state AND NEW.to_state IS NOT DISTINCT FROM OLD.to_state
       AND NEW.visibility = OLD.visibility AND NEW.created_at = OLD.created_at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
