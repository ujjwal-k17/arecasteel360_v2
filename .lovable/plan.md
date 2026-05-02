## Bug

`Total Dispatch MT` on **Sales Analysis** is overstated because `parseQtyToMT()` in `src/lib/business-overview-utils.ts` falls back to "assume MT" for unrecognized units. Live data contains line items with `qty: "3.00 PCS"` — these get counted as 3.0 MT.

Units present in `tally_vouchers.line_items[].qty`:
- `MT` — 5497 lines (correct)
- `null` — 615 lines (job-work/service, no tonnage — should be 0)
- `kg` — 13 lines (should convert: 1 MT = 1000 kg)
- `PCS` — 6 lines (should be ignored)

## Fix

Rewrite `parseQtyToMT()` in `src/lib/business-overview-utils.ts` with strict unit handling:

- **MT / ton / tonne** → use as-is
- **KG / KGS** → divide by 1000
- **PCS / NOS / anything else** → return 0 (ignored)
- **null / empty / unparseable** → return 0
- **Pure number with no unit** → return 0 (safer than assuming MT, since unit-less entries in this dataset are not weights)

```ts
export function parseQtyToMT(qty: unknown): number {
  if (qty == null) return 0;
  if (typeof qty === 'number') return qty; // already numeric MT (legacy callers)
  const s = String(qty).trim();
  if (!s) return 0;
  const match = s.match(/([\d,]*\.?\d+)\s*([a-zA-Z]+)?/);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) return 0;
  const unit = (match[2] || '').toLowerCase();

  if (unit.startsWith('mt') || unit === 'ton' || unit === 'tons' || unit === 'tonne' || unit === 'tonnes') {
    return num;                 // MT
  }
  if (unit === 'kg' || unit === 'kgs') {
    return num / 1000;          // KG → MT
  }
  // PCS, NOS, BOX, no-unit, anything else → ignore
  return 0;
}
```

## Effect on Sales Analysis totals

- `"11.6050 MT"` → 11.605 (unchanged)
- `"1200 KG"` / `"1200 Kgs"` → 1.2 (unchanged)
- `"3.00 PCS"` → **0** (was 3.0 — the bug)
- `null` → 0 (unchanged)

This propagates correctly through `totalMTFromLineItems()`, which is the only consumer, used by Sales Analysis, Purchase Analysis, MIS Dashboard, and Party Analysis. No financial or inventory logic touches this function.

## Files

- `src/lib/business-overview-utils.ts` — replace `parseQtyToMT` body only.

No DB changes, no migrations, no other components affected.