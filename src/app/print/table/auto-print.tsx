"use client";

import * as React from "react";

/** Opens the print dialog once the receipt's fonts have loaded. */
export function AutoPrint() {
  React.useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
