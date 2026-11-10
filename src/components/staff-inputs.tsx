"use client";
import { useEffect, useState } from "react";

/** Build the typed JSON `input` the gateway validates (it is re-validated server-side by Zod). */
export function DecisionInput({ accountNumber, chargeId }: { accountNumber: string; chargeId: string }) {
  const [decision, setDecision] = useState("APPROVED_FOR_REFUND_PROCESSING");
  useEffect(() => {
    const el = document.getElementById("decision") as HTMLSelectElement | null;
    const h = () => setDecision(el?.value ?? "APPROVED_FOR_REFUND_PROCESSING");
    el?.addEventListener("change", h);
    return () => el?.removeEventListener("change", h);
  }, []);
  return <input type="hidden" name="input" value={JSON.stringify({ accountNumber, chargeId, decision })} />;
}
export function SlotInput() {
  const [slot, setSlot] = useState("");
  useEffect(() => {
    const el = document.getElementById("slot") as HTMLInputElement | null;
    const h = () => setSlot(el?.value ?? "");
    el?.addEventListener("input", h);
    return () => el?.removeEventListener("input", h);
  }, []);
  return <input type="hidden" name="input" value={JSON.stringify({ newSlot: slot })} />;
}
