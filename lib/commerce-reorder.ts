/** Compute cart additions before scheduling React state updates. */
export function reorderCartItems(
  items: readonly { variantId: number; quantity: number }[],
  variants: ReadonlyMap<number, { stockStatus: string; minimumOrderQuantity: number }>,
): Record<number, number> {
  const additions: Record<number, number> = {};
  for (const item of items) {
    const variant = variants.get(item.variantId);
    if (!variant || variant.stockStatus === "out_of_stock") continue;
    additions[item.variantId] = Math.max(item.quantity, variant.minimumOrderQuantity);
  }
  return additions;
}
