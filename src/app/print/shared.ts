/**
 * Styles for the printed receipts (order bill, kitchen ticket, table bill).
 * Static text — no user data — sized for an 80 mm or 58 mm thermal roll.
 */
export function printCss(paper: "80" | "58"): string {
  const width = paper === "58" ? "50mm" : "72mm";
  return `
    @page { size: ${paper}mm auto; margin: 3mm; }
    html, body { background: #fff !important; color: #000 !important; }
    .receipt {
      width: ${width}; margin: 12px auto; color: #000; background: #fff;
      font-size: 12px; line-height: 1.7;
    }
    .receipt .center { text-align: center; }
    .receipt .small { font-size: 11px; }
    .receipt .venue { font-size: 15px; font-weight: 800; }
    .receipt .big { font-size: 30px; font-weight: 900; line-height: 1.2; }
    .receipt .logo { width: 48px; height: 48px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .receipt hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .receipt .row { display: flex; justify-content: space-between; gap: 8px; }
    .receipt .total { font-size: 14px; font-weight: 900; margin-top: 2px; }
    .receipt table { width: 100%; border-collapse: collapse; }
    .receipt td { vertical-align: top; padding: 2px 0; }
    .receipt .qty { white-space: nowrap; padding-inline-end: 4px; font-weight: 700; }
    .receipt .amount { white-space: nowrap; text-align: end; padding-inline-start: 6px; }
    .receipt .option { display: block; font-size: 11px; padding-inline-start: 8px; }
    .receipt .option::before { content: "↳ "; }
    .receipt[data-kind="ticket"] { font-size: 15px; }
    .receipt .ticket-items { list-style: none; padding: 0; margin: 0; }
    .receipt .ticket-items li { padding: 4px 0; border-bottom: 1px dotted #000; }
    .receipt .note { display: block; margin-top: 2px; padding: 2px 4px; border: 1.5px solid #000; font-weight: 700; }
    @media print {
      .no-print { display: none !important; }
      .receipt { margin: 0; }
    }
  `;
}
