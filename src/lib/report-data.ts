type Amount = number | string;
type Timestamp = string | Date;

export type ReportSnapshot = {
  inventory: Array<{ id: string; code: string; product: string; material: string; color: string; packaging_type: string; remaining_grams: Amount; status: string; unit_cost: Amount; supplier: string; created_at: Timestamp; updated_at: Timestamp; source_receipt_id: string | null; source_receipt_item_id: string | null }>;
  receipts: Array<{ id: string; receipt_number: string; supplier: string; invoice_number: string; purchase_date: Timestamp; received_date: Timestamp; status: string; discount: Amount; tax: Amount; shipping: Amount; notes: string; created_at: Timestamp; updated_at: Timestamp }>;
  receiptItems: Array<{ id: string; receipt_id: string; quantity: number; unit_weight_grams: Amount; unit_cost: Amount }>;
  sessions: Array<{ id: string; usage_number: string; user_name: string; usage_type: string; non_class_type: string | null; status: string; started_at: Timestamp; completed_at: Timestamp | null; result: string | null; notes: string }>;
  sessionItems: Array<{ session_id: string; inventory_item_id: string; starting_grams: Amount; used_grams: Amount | null; returned_grams: Amount | null }>;
};

export const stockStatusLabels: Record<string, string> = { AVAILABLE: "Tersedia", IN_USE: "Digunakan", LOW_STOCK: "Hampir habis", EMPTY: "Habis", DAMAGED: "Rusak", INACTIVE: "Nonaktif" };
export const resultLabels: Record<string, string> = { SUCCESS: "Berhasil", PARTIAL: "Sebagian berhasil", FAILED: "Gagal", CANCELLED: "Dibatalkan" };
export const sessionStatusLabels: Record<string, string> = { ACTIVE: "Aktif", COMPLETED: "Selesai", CANCELLED: "Dibatalkan" };
const iso = (value: Timestamp) => new Date(value).toISOString();
const dateOnly = (value: Timestamp) => iso(value).slice(0, 10);
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = <T,>(items: T[], value: (item: T) => number) => round(items.reduce((total, item) => total + value(item), 0));

export function jakartaDate(value: Timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export type StockMovement = { id: string; time: string; code: string; type: "Barang masuk" | "Penggunaan"; reference: string; change: number; before: number; after: number; user: string | null };
export type ReportActivity = { id: string; time: string; kind: "receipt" | "start" | "complete"; title: string; detail: string; person: string };

// Reports are derived from one database snapshot. Never invent movements for manual stock edits.
export function buildReports(snapshot: ReportSnapshot, now = new Date()) {
  const receiptById = new Map(snapshot.receipts.map((item) => [item.id, item]));
  const lineById = new Map(snapshot.receiptItems.map((item) => [item.id, item]));
  const stockById = new Map(snapshot.inventory.map((item) => [item.id, item]));
  const inventory = snapshot.inventory.map((item) => ({
    id: item.id, code: item.code, product: item.product, material: item.material, color: item.color,
    packagingType: item.packaging_type, remainingGrams: Number(item.remaining_grams), status: item.status,
    unitCost: Number(item.unit_cost), supplier: item.supplier, createdAt: iso(item.created_at), updatedAt: iso(item.updated_at),
  })).sort((a, b) => a.code.localeCompare(b.code));

  const usages = snapshot.sessions.map((session) => {
    const items = snapshot.sessionItems.filter((item) => item.session_id === session.id).map((item) => {
      const stock = stockById.get(item.inventory_item_id);
      const line = stock?.source_receipt_item_id ? lineById.get(stock.source_receipt_item_id) : undefined;
      const usedGrams = item.used_grams === null ? null : Number(item.used_grams);
      // Manual units have no recorded original weight; their cost cannot be inferred from remaining grams.
      const estimatedCost = usedGrams === 0 ? 0 : usedGrams !== null && stock && line && Number(line.unit_weight_grams) > 0
        ? round(usedGrams * Number(stock.unit_cost) / Number(line.unit_weight_grams)) : null;
      return { inventoryItemId: item.inventory_item_id, code: stock?.code ?? "Unit tidak tersedia", startingGrams: Number(item.starting_grams), usedGrams, returnedGrams: item.returned_grams === null ? null : Number(item.returned_grams), estimatedCost };
    });
    const completed = session.status === "COMPLETED";
    return {
      id: session.id, number: session.usage_number, userName: session.user_name,
      category: session.usage_type === "CLASS" ? "Kelas" : session.non_class_type === "TRIAL_PRINT" ? "Trial Print" : "Sample",
      status: session.status, startedAt: iso(session.started_at), completedAt: session.completed_at ? iso(session.completed_at) : null,
      result: session.result, notes: session.notes, unitCount: items.length, items,
      totalStartingGrams: sum(items, (item) => item.startingGrams),
      totalUsedGrams: completed ? sum(items, (item) => item.usedGrams ?? 0) : null,
      totalReturnedGrams: completed ? sum(items, (item) => item.returnedGrams ?? 0) : null,
      estimatedCost: completed && items.every((item) => item.estimatedCost !== null) ? sum(items, (item) => item.estimatedCost!) : null,
    };
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const receipts = snapshot.receipts.map((receipt) => {
    const lines = snapshot.receiptItems.filter((line) => line.receipt_id === receipt.id);
    const subtotal = sum(lines, (line) => Number(line.quantity) * Number(line.unit_cost));
    return {
      id: receipt.id, number: receipt.receipt_number, supplier: receipt.supplier, invoiceNumber: receipt.invoice_number,
      purchaseDate: dateOnly(receipt.purchase_date), receivedDate: dateOnly(receipt.received_date), status: receipt.status,
      unitCount: sum(lines, (line) => Number(line.quantity)), totalGrams: sum(lines, (line) => Number(line.quantity) * Number(line.unit_weight_grams)),
      subtotal, discount: Number(receipt.discount), tax: Number(receipt.tax), shipping: Number(receipt.shipping),
      total: round(subtotal - Number(receipt.discount) + Number(receipt.tax) + Number(receipt.shipping)),
      notes: receipt.notes, updatedAt: iso(receipt.updated_at),
    };
  }).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));

  const movements: StockMovement[] = [];
  for (const stock of snapshot.inventory) {
    const receipt = stock.source_receipt_id ? receiptById.get(stock.source_receipt_id) : undefined;
    const line = stock.source_receipt_item_id ? lineById.get(stock.source_receipt_item_id) : undefined;
    if (receipt?.status === "FINALIZED" && line) movements.push({
      id: `receipt-${stock.id}`, time: `${dateOnly(receipt.received_date)}T00:00:00+07:00`, code: stock.code,
      type: "Barang masuk", reference: receipt.receipt_number, change: Number(line.unit_weight_grams),
      before: 0, after: Number(line.unit_weight_grams), user: null,
    });
  }
  for (const session of usages) {
    if (session.status !== "COMPLETED" || !session.completedAt) continue;
    for (const item of session.items) {
      if (item.usedGrams === null || item.returnedGrams === null) continue;
      movements.push({ id: `usage-${session.id}-${item.inventoryItemId}`, time: session.completedAt, code: item.code, type: "Penggunaan", reference: session.number, change: -item.usedGrams, before: item.startingGrams, after: item.returnedGrams, user: session.userName });
    }
  }
  movements.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime() || a.id.localeCompare(b.id));

  const activities: ReportActivity[] = receipts.filter((item) => item.status === "FINALIZED").map((item) => ({ id: `receipt-${item.id}`, time: item.updatedAt, kind: "receipt", title: "Penerimaan final", detail: `${item.number} · ${item.unitCount} unit`, person: item.supplier }));
  for (const session of usages) {
    activities.push({ id: `start-${session.id}`, time: session.startedAt, kind: "start", title: "Penggunaan dimulai", detail: `${session.number} · ${session.unitCount} unit`, person: session.userName });
    if (session.status === "COMPLETED" && session.completedAt) activities.push({ id: `complete-${session.id}`, time: session.completedAt, kind: "complete", title: "Penggunaan selesai", detail: `${session.number} · ${session.totalUsedGrams?.toLocaleString("id-ID")} g`, person: session.userName });
  }
  activities.sort((a, b) => b.time.localeCompare(a.time));
  const lowStock = inventory.filter((item) => item.remainingGrams > 0 && item.remainingGrams < 500).sort((a, b) => a.remainingGrams - b.remainingGrams);
  const available = inventory.filter((item) => item.status === "AVAILABLE").length;
  const inUse = inventory.filter((item) => item.status === "IN_USE").length;
  const activeSessions = usages.filter((item) => item.status === "ACTIVE");
  const healthyUnits = inventory.filter((item) => ["AVAILABLE", "IN_USE"].includes(item.status) && item.remainingGrams >= 500).length;

  return {
    generatedAt: now.toISOString(), today: jakartaDate(now), currentMonth: jakartaDate(now).slice(0, 7),
    inventory, usages, receipts, movements, activities, activeSessions, lowStock,
    summary: { totalUnits: inventory.length, totalGrams: sum(inventory, (item) => item.remainingGrams), available, inUse, lowStock: lowStock.length, healthyPercent: inventory.length ? Math.round(healthyUnits / inventory.length * 100) : 0, attentionUnits: inventory.length - healthyUnits },
  };
}

export type ReportsData = ReturnType<typeof buildReports>;

export function usageTotals(usages: ReportsData["usages"]) {
  const completed = usages.filter((item) => item.status === "COMPLETED");
  const incompleteCostCount = completed.filter((item) => item.estimatedCost === null).length;
  return { count: completed.length, grams: sum(completed, (item) => item.totalUsedGrams ?? 0), estimatedCost: incompleteCostCount ? null : sum(completed, (item) => item.estimatedCost ?? 0), incompleteCostCount };
}

export function filterReportPeriod(data: ReportsData, month: string) {
  const matches = (date: string) => !month || date.startsWith(month);
  return {
    usages: data.usages.filter((item) => matches(jakartaDate(item.completedAt ?? item.startedAt))),
    receipts: data.receipts.filter((item) => matches(item.receivedDate)),
    movements: data.movements.filter((item) => matches(jakartaDate(item.time))),
  };
}

export function toCsv(rows: Array<Array<string | number | null>>) {
  const cell = (value: string | number | null) => {
    let text = value === null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
