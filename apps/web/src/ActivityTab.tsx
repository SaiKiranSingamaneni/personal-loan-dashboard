import { useState } from "react";
import { ActivityEntryForm, type ActivityFormEntry } from "./ActivityEntryForm.js";
import { ActivityTable } from "./ActivityTable.js";

export function ActivityTab({ loanId }: { loanId: string }) {
  const [editingEntry, setEditingEntry] = useState<ActivityFormEntry | null>(null);
  return <div className="activity-tab-panel" role="tabpanel">
    <ActivityEntryForm loanId={loanId} editingEntry={editingEntry} onEditComplete={() => setEditingEntry(null)} />
    <ActivityTable loanId={loanId} onEdit={setEditingEntry} />
  </div>;
}