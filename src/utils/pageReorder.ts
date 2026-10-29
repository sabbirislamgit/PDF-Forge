/**
 * Page Reordering Algorithms & Helpers for PDF Forge
 */

/**
 * Calculates the final destination index for a page reorder operation
 * based on whether the drop occurred before or after the target card.
 *
 * @param fromIdx Source index of the dragged page (0-based)
 * @param targetIndex Index of the hovered/target card (0-based)
 * @param isAfter Whether the drop indicator is on the right/after side of targetIndex
 * @param totalPages Total number of pages in the document
 * @returns The destination index (0-based)
 */
export function calculateDropDestination(
  fromIdx: number,
  targetIndex: number,
  isAfter: boolean,
  totalPages: number
): number {
  if (totalPages <= 1) return 0;

  let dest = targetIndex;
  if (isAfter) {
    dest = fromIdx < targetIndex ? targetIndex : targetIndex + 1;
  } else {
    dest = fromIdx < targetIndex ? targetIndex - 1 : targetIndex;
  }

  // Fallback guard for adjacent movements
  if (dest === fromIdx && targetIndex !== fromIdx) {
    dest = targetIndex;
  }

  return Math.max(0, Math.min(totalPages - 1, dest));
}
