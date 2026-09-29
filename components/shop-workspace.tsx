"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Minus, Package, Plus, RotateCcw, Search, ShoppingCart } from "lucide-react";
import type { CommerceOrder, CommerceProduct } from "@/lib/commerce-contract";
import { reorderCartItems } from "@/lib/commerce-reorder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

function orderDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function ShopWorkspace({
  products,
  initialOrders,
  userId,
}: {
  products: CommerceProduct[];
  initialOrders: CommerceOrder[];
  userId: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [fabricFilter, setFabricFilter] = useState("");
  const [designFilter, setDesignFilter] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const variants = useMemo(
    () =>
      new Map(
        products.flatMap((product) =>
          product.variants.map((variant) => [
            variant.id,
            { ...variant, product: product.name },
          ] as const),
        ),
      ),
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      if (fabricFilter && product.fabricType !== fabricFilter) return false;
      if (designFilter && product.design !== designFilter) return false;
      if (!normalized) return true;
      return [product.name, product.fabricType, product.design, product.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [products, query, fabricFilter, designFilter]);
  const fabricTypes = Array.from(
    new Set(products.map((product) => product.fabricType).filter(Boolean)),
  ) as string[];
  const designs = Array.from(
    new Set(products.map((product) => product.design).filter(Boolean)),
  ) as string[];
  const cartEntries = Object.entries(cart).flatMap(([variantId, quantity]) => {
    const variant = variants.get(Number(variantId));
    return variant ? [{ variant, quantity }] : [];
  });
  const totalPaise = cartEntries.reduce(
    (sum, { variant, quantity }) => sum + variant.pricePaise * quantity,
    0,
  );

  function addToCart(variantId: number) {
    const variant = variants.get(variantId);
    if (!variant) return;
    setCart((current) => ({
      ...current,
      [variantId]: current[variantId] ?? variant.minimumOrderQuantity,
    }));
  }

  function changeQuantity(variantId: number, next: number) {
    const variant = variants.get(variantId);
    if (!variant) return;
    if (next < variant.minimumOrderQuantity) {
      setCart((current) => {
        const updated = { ...current };
        delete updated[variantId];
        return updated;
      });
      return;
    }
    setCart((current) => ({ ...current, [variantId]: next }));
  }

  function reorder(order: CommerceOrder) {
    const additions = reorderCartItems(order.items, variants);
    const added = Object.keys(additions).length;
    setCart((current) => ({ ...current, ...additions }));
    setMessage(
      added
        ? `${added} item${added === 1 ? "" : "s"} added from order #${order.id}.`
        : "No items from that order are currently available.",
    );
  }

  async function placeOrder() {
    if (!cartEntries.length) return;
    const items = cartEntries.map(({ variant, quantity }) => ({
      variantId: variant.id, quantity,
    })).sort((a, b) => a.variantId - b.variantId);
    const fingerprint = JSON.stringify({ notes: notes.trim(), items });
    const retryStorageKey = `dealer-ops-order-retry:${userId}`;
    if (!pendingRequest.current) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(retryStorageKey) ?? "null") as { fingerprint?: string; key?: string } | null;
        if (saved?.fingerprint === fingerprint && saved.key && /^[0-9a-f-]{36}$/i.test(saved.key)) {
          pendingRequest.current = { fingerprint, key: saved.key };
        }
      } catch {
        // A blocked storage API must not block checkout.
      }
    }
    if (pendingRequest.current?.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    }
    const requestKey = pendingRequest.current.key;
    try { sessionStorage.setItem(retryStorageKey, JSON.stringify(pendingRequest.current)); } catch {}
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/commerce/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestKey,
          notes,
          items,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        orderId?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "The order could not be placed.");
      pendingRequest.current = null;
      try { sessionStorage.removeItem(retryStorageKey); } catch {}
      setCart({});
      setNotes("");
      setMessage(`Order #${body.orderId} was placed successfully.`);
      const ordersResponse = await fetch("/api/commerce/orders", {
        cache: "no-store",
      });
      const ordersBody = (await ordersResponse.json().catch(() => ({}))) as {
        orders?: CommerceOrder[];
      };
      if (ordersResponse.ok && ordersBody.orders) setOrders(ordersBody.orders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The order could not be placed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
      <div className="min-w-0 space-y-8">
        <section aria-labelledby="catalog-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f6a65]">
                Catalog
              </p>
              <h1 id="catalog-title" className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
                Order stock for your shop
              </h1>
            </div>
            <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-[minmax(0,1fr)_150px_150px]">
              <label className="relative block">
                <span className="sr-only">Search catalog</span>
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-[#7c7771]" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="h-11 bg-white pl-9" />
              </label>
              <Select value={fabricFilter || "all"} onValueChange={(value) => setFabricFilter(value === "all" ? "" : value)}>
                <SelectTrigger aria-label="Filter by fabric type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fabrics</SelectItem>
                  {fabricTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={designFilter || "all"} onValueChange={(value) => setDesignFilter(value === "all" ? "" : value)}>
                <SelectTrigger aria-label="Filter by design"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All designs</SelectItem>
                  {designs.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {visibleProducts.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <Card key={product.id} className="gap-4 border-[#ded7cc] py-5 shadow-none">
                  <CardHeader className="px-5">
                    <div className="relative grid h-36 place-items-center overflow-hidden rounded-xl bg-[#f4e5de] text-[#252a44]">
                      {product.imageUrls[0] ? (
                        <Image src={product.imageUrls[0]} alt={product.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" unoptimized />
                      ) : (
                        <Package className="h-8 w-8" aria-hidden="true" />
                      )}
                    </div>
                    <CardTitle className="mt-2 text-lg">{product.name}</CardTitle>
                    <CardDescription>
                      {[product.fabricType, product.design].filter(Boolean).join(" · ") ||
                        product.description ||
                        "Available for dealer ordering"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5">
                    {product.variants.map((variant) => {
                      const unavailable = variant.stockStatus === "out_of_stock";
                      return (
                        <div key={variant.id} className="rounded-xl border border-[#e9e2d8] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{variant.color}</p>
                              <p className="mt-0.5 text-xs text-[#7c7771]">
                                {variant.sku} · MOQ {variant.minimumOrderQuantity}
                              </p>
                            </div>
                            <Badge variant={unavailable ? "outline" : "secondary"}>
                              {unavailable ? "Out of stock" : currency(variant.pricePaise)}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 h-11 w-full"
                            disabled={unavailable || Boolean(cart[variant.id])}
                            onClick={() => addToCart(variant.id)}
                          >
                            {cart[variant.id] ? "In cart" : "Add to cart"}
                          </Button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[#d6cfc4] bg-white p-10 text-center text-sm text-[#6f6a65]">
              No products match this search.
            </div>
          )}
        </section>

        <section aria-labelledby="orders-title">
          <h2 id="orders-title" className="text-2xl font-semibold tracking-[-0.03em]">
            Order history
          </h2>
          <div className="mt-4 space-y-3">
            {orders.length ? (
              orders.map((order) => (
                <Card key={order.id} className="gap-3 border-[#ded7cc] py-4 shadow-none">
                  <CardHeader className="flex-row items-start justify-between px-5">
                    <div>
                      <CardTitle>Order #{order.id}</CardTitle>
                      <CardDescription className="mt-1">{orderDate(order.createdAt)}</CardDescription>
                    </div>
                    <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
                  </CardHeader>
                  <CardContent className="px-5 text-sm">
                    <p className="text-[#5f5b57]">
                      {order.items.map((item) => `${item.product} · ${item.color} × ${item.quantity}`).join(", ")}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="font-semibold">{currency(order.totalPaise)}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => reorder(order)}>
                        <RotateCcw aria-hidden="true" /> Reorder
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-[#d6cfc4] bg-white p-8 text-sm text-[#6f6a65]">
                Your placed orders will appear here.
              </p>
            )}
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-[#ded7cc] bg-white p-5 lg:sticky lg:top-6" aria-labelledby="cart-title">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-[#252a44]" aria-hidden="true" />
          <h2 id="cart-title" className="text-lg font-semibold">Current order</h2>
          <Badge className="ml-auto">{cartEntries.length}</Badge>
        </div>
        {cartEntries.length ? (
          <div className="mt-5 space-y-4">
            {cartEntries.map(({ variant, quantity }) => (
              <div key={variant.id} className="border-b border-[#e9e2d8] pb-4 last:border-0">
                <div className="flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{variant.product}</p>
                    <p className="text-[#7c7771]">{variant.color}</p>
                  </div>
                  <p className="font-semibold">{currency(variant.pricePaise * quantity)}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-11 w-11"
                    aria-label={`Remove one ${variant.product} ${variant.color}`}
                    onClick={() => changeQuantity(variant.id, quantity - 1)}
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-11 w-11"
                    aria-label={`Add one ${variant.product} ${variant.color}`}
                    onClick={() => changeQuantity(variant.id, quantity + 1)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <label htmlFor="order-notes" className="text-sm font-medium">Order notes</label>
              <Textarea
                id="order-notes"
                className="mt-2"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional delivery or packing notes"
                maxLength={1_000}
              />
            </div>
            <div className="flex items-center justify-between border-t border-[#ded7cc] pt-4">
              <span className="text-sm text-[#6f6a65]">Total</span>
              <span className="text-lg font-semibold">{currency(totalPaise)}</span>
            </div>
            <Button className="h-11 w-full" disabled={pending} onClick={placeOrder}>
              {pending ? "Placing order…" : "Place order"}
            </Button>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-[#f5f0e9] p-4 text-sm leading-6 text-[#6f6a65]">
            Add a product variant to start an order.
          </p>
        )}
        {message ? <p className="mt-4 text-sm" role="status">{message}</p> : null}
      </aside>
    </div>
  );
}
