-- Append-only enforcement: the evidence history cannot be edited or deleted through SQL.
CREATE OR REPLACE FUNCTION orylo_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON case_events
  FOR EACH ROW EXECUTE FUNCTION orylo_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION orylo_block_mutation();
--> statement-breakpoint
CREATE TRIGGER outcome_ledger_append_only BEFORE UPDATE OR DELETE ON outcome_ledger
  FOR EACH ROW EXECUTE FUNCTION orylo_block_mutation();
--> statement-breakpoint
-- Only verified outcome evidence may move a case into VERIFIED_RESOLVED, and only when every
-- required objective is verified (or not applicable). Enforced here so no code path can bypass it.
CREATE OR REPLACE FUNCTION orylo_guard_verified_resolved() RETURNS trigger AS $$
BEGIN
  IF NEW.state = 'VERIFIED_RESOLVED' AND OLD.state IS DISTINCT FROM 'VERIFIED_RESOLVED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM outcome_ledger l
      WHERE l.case_id = NEW.id AND l.organization_id = NEW.organization_id AND l.final_outcome = 'VERIFIED'
    ) THEN
      RAISE EXCEPTION 'VERIFIED_RESOLVED requires verified outcome evidence in the ledger' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM case_objectives o
      WHERE o.case_id = NEW.id AND o.organization_id = NEW.organization_id AND o.required
        AND o.status NOT IN ('VERIFIED', 'NOT_APPLICABLE')
    ) THEN
      RAISE EXCEPTION 'VERIFIED_RESOLVED requires every required objective to be verified' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cases_guard_verified_resolved BEFORE UPDATE ON resolution_cases
  FOR EACH ROW EXECUTE FUNCTION orylo_guard_verified_resolved();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orylo_guard_case_insert() RETURNS trigger AS $$
BEGIN
  IF NEW.state = 'VERIFIED_RESOLVED' THEN
    RAISE EXCEPTION 'a case cannot be created already resolved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cases_guard_insert BEFORE INSERT ON resolution_cases
  FOR EACH ROW EXECUTE FUNCTION orylo_guard_case_insert();
