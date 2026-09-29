"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock3,
  IndianRupee,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type {
  CommerceAccount,
  CommerceCategory,
  CommerceOrder,
  CommerceOrderStatus,
  CommerceProduct,
  CommerceStats,
} from "@/lib/commerce-contract";
import {
  canDeleteCommerceAccount,
  commerceOrderStatuses,
} from "@/lib/commerce-contract";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type DealerOption = { id: number; name: string; pincode: string };
type CommerceView = "dashboard" | "orders" | "products" | "accounts";
type VariantDraft = {
  color: string;
  sku: string;
  priceRupees: string;
  minimumOrderQuantity: string;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
};

const emptyVariant = (): VariantDraft => ({
  color: "",
  sku: "",
  priceRupees: "",
  minimumOrderQuantity: "1",
  stockStatus: "in_stock",
});

function currency(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

async function responseBody<T>(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}

export function CommerceWorkspace({
  products: initialProducts,
  categories,
  initialOrders,
  stats,
  initialAccounts,
  dealerOptions,
  isAdmin,
  active,
  onAccountsChange,
}: {
  products: CommerceProduct[];
  categories: CommerceCategory[];
  initialOrders: CommerceOrder[];
  stats: CommerceStats;
  initialAccounts: CommerceAccount[];
  dealerOptions: DealerOption[];
  isAdmin: boolean;
  active: boolean;
  onAccountsChange: (accounts: CommerceAccount[]) => void;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [view, setView] = useState<CommerceView>("dashboard");
  const latestOrderId = useRef(Math.max(0, ...initialOrders.map((order) => order.id)));
  const orderRevision = useRef(0);
  const orderRequest = useRef(0);
  const openedOnce = useRef(false);

  const refreshOrders = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const request = ++orderRequest.current;
    const revision = orderRevision.current;
    try {
      const body = await responseBody<{ orders: CommerceOrder[] }>(
        await fetch("/api/commerce/orders", { cache: "no-store" }),
        "Orders could not be refreshed.",
      );
      if (request !== orderRequest.current || revision !== orderRevision.current) return;
      const newest = Math.max(0, ...body.orders.map((order) => order.id));
      if (newest > latestOrderId.current) {
        setMessage(`New order #${newest} received.`);
        latestOrderId.current = newest;
      }
      setOrders(body.orders);
      setRefreshError(false);
    } catch {
      if (request === orderRequest.current) setRefreshError(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    if (openedOnce.current) queueMicrotask(() => void refreshOrders());
    else openedOnce.current = true;
    const interval = window.setInterval(() => void refreshOrders(), 30_000);
    const visible = () => { if (document.visibilityState === "visible") void refreshOrders(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); orderRequest.current += 1; };
  }, [active, refreshOrders]);

  async function refreshProducts() {
    const body = await responseBody<{ products: CommerceProduct[] }>(
      await fetch("/api/commerce/products", { cache: "no-store" }),
      "Products could not be refreshed.",
    );
    setProducts(body.products);
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6f6a65]">
          Operations
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#252a30] sm:text-3xl">
          Commerce operations
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a65]">
          {isAdmin
            ? "Maintain the dealer catalog, process orders, and control who can access ordering operations."
            : "Maintain the dealer catalog and process dealer orders."}
        </p>
      </div>
      {message ? (
        <p role="status" className="mb-4 rounded-xl border border-[#ded7cc] bg-white px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}
      {refreshError ? <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">Order refresh failed; current orders remain available. <Button type="button" variant="outline" onClick={() => void refreshOrders()}>Retry</Button></p> : null}
      <Tabs value={view} onValueChange={(value) => setView(value as CommerceView)}>
        <TabsList
          variant="line"
          aria-label="Commerce view"
          className="h-11 w-full justify-start gap-0 overflow-x-auto border-b border-[#d6cfc4] p-0"
        >
          <TabsTrigger value="dashboard" className="h-11 flex-none rounded-none px-3 after:bottom-0 after:bg-[#b65a38] data-[state=active]:text-[#9b4d32] sm:px-4">
            <BarChart3 className="hidden sm:block" aria-hidden="true" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="orders" className="h-11 flex-none rounded-none px-3 after:bottom-0 after:bg-[#b65a38] data-[state=active]:text-[#9b4d32] sm:px-4">
            <ClipboardList className="hidden sm:block" aria-hidden="true" /> Orders
          </TabsTrigger>
          <TabsTrigger value="products" className="h-11 flex-none rounded-none px-3 after:bottom-0 after:bg-[#b65a38] data-[state=active]:text-[#9b4d32] sm:px-4">
            <Boxes className="hidden sm:block" aria-hidden="true" /> Products
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="accounts" className="h-11 flex-none rounded-none px-3 after:bottom-0 after:bg-[#b65a38] data-[state=active]:text-[#9b4d32] sm:px-4">
              <Users className="hidden sm:block" aria-hidden="true" /> Accounts
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="dashboard" className="mt-5">
          <DashboardPanel
            stats={stats}
            products={products}
            orders={orders}
            accounts={initialAccounts}
            isAdmin={isAdmin}
            onNavigate={setView}
          />
        </TabsContent>
        <TabsContent value="orders" className="mt-5">
          <OrdersPanel
            orders={orders}
            onOrdersChange={(updated) => { orderRevision.current += 1; setOrders(updated); }}
            onMessage={setMessage}
            onNavigate={setView}
          />
        </TabsContent>
        <TabsContent value="products" className="mt-5">
          <ProductsPanel
            products={products}
            categories={categories}
            onRefresh={refreshProducts}
            onMessage={setMessage}
          />
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="accounts" className="mt-5">
            <AccountsPanel
              accounts={initialAccounts}
              dealerOptions={dealerOptions}
              onAccountsChange={onAccountsChange}
              onMessage={setMessage}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function DashboardPanel({
  stats,
  products,
  orders,
  accounts,
  isAdmin,
  onNavigate,
}: {
  stats: CommerceStats;
  products: CommerceProduct[];
  orders: CommerceOrder[];
  accounts: CommerceAccount[];
  isAdmin: boolean;
  onNavigate: (view: CommerceView) => void;
}) {
  const cards = [
    { label: "Orders today", value: String(stats.ordersToday), icon: ShoppingBag },
    { label: "Pending", value: String(stats.pendingOrders), icon: Clock3 },
    { label: "Revenue today", value: currency(stats.revenueTodayPaise), icon: IndianRupee },
    { label: "Revenue all-time", value: currency(stats.revenueAllTimePaise), icon: BarChart3 },
  ];
  const nextAction = !products.length
    ? { label: "Add the first product", view: "products" as const, detail: "A product with at least one variant is required before dealers can order." }
    : isAdmin && !accounts.some((account) => account.roles.includes("retailer"))
      ? { label: "Create a retailer account", view: "accounts" as const, detail: "Link a retailer login to an existing dealer record." }
      : { label: "Review orders", view: "orders" as const, detail: orders.length ? "Check current fulfillment status and recent order details." : "This queue is ready for the first dealer order." };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="gap-3 rounded-2xl border-[#ded7cc] py-5 shadow-[0_8px_24px_rgba(37,42,68,0.04)]">
            <CardHeader className="flex-row items-center justify-between px-5">
              <CardTitle className="text-sm font-medium text-[#6f6a65]">{label}</CardTitle>
              <Icon className="h-4 w-4 text-[#6f6a65]" aria-hidden="true" />
            </CardHeader>
            <CardContent className="px-5 text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="gap-4 rounded-2xl border-[#ded7cc] py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle>Commerce readiness</CardTitle>
          </CardHeader>
          <CardContent className={`grid gap-3 px-5 ${isAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {[
              ["Products", products.length, "Catalog items"],
              ...(isAdmin ? [["Retailers", accounts.filter((account) => account.roles.includes("retailer")).length, "Linked accounts"]] : []),
              ["Orders", orders.length, "All-time orders"],
            ].map(([label, count, detail]) => (
              <div key={String(label)} className="rounded-xl border border-[#e7dfd4] bg-[#fffcf7] p-4">
                <CheckCircle2 className="mb-3 h-5 w-5 text-[#356a9a]" aria-hidden="true" />
                <p className="text-2xl font-semibold text-[#252a30]">{count}</p>
                <p className="mt-1 text-sm font-medium text-[#34333a]">{label}</p>
                <p className="mt-0.5 text-xs text-[#6f6a65]">{detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="gap-4 rounded-2xl border-[#ded7cc] bg-[#252a44] py-5 text-white shadow-none">
          <CardHeader className="px-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/70">Next best action</p>
            <CardTitle className="text-xl text-white">{nextAction.label}</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <p className="text-sm leading-6 text-white/75">{nextAction.detail}</p>
            <Button type="button" onClick={() => onNavigate(nextAction.view)} className="mt-5 h-11 bg-white text-[#252a44] hover:bg-[#f4efe8]">
              Continue <ArrowRight aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrdersPanel({
  orders,
  onOrdersChange,
  onMessage,
  onNavigate,
}: {
  orders: CommerceOrder[];
  onOrdersChange: (orders: CommerceOrder[]) => void;
  onMessage: (message: string) => void;
  onNavigate: (view: CommerceView) => void;
}) {
  async function changeStatus(orderId: number, status: CommerceOrderStatus) {
    try {
      await responseBody(
        await fetch(`/api/commerce/orders/${orderId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        }),
        "The order status could not be updated.",
      );
      onOrdersChange(orders.map((order) => (order.id === orderId ? { ...order, status } : order)));
      onMessage(`Order #${orderId} is now ${status.replace("_", " ")}.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The order could not be updated.");
    }
  }

  if (!orders.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No orders yet"
        message="Dealer orders will appear here after a retailer completes checkout."
        action={<Button type="button" variant="outline" className="h-11" onClick={() => onNavigate("products")}>Review catalog</Button>}
      />
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Card key={order.id} className="gap-4 border-[#ded7cc] py-5 shadow-none">
          <CardHeader className="flex-row items-start justify-between px-5">
            <div>
              <CardTitle>Order #{order.id} · {order.dealer}</CardTitle>
              <p className="mt-1 text-sm text-[#6f6a65]">
                {new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </p>
            </div>
            <Select
              value={order.status}
              onValueChange={(value) => changeStatus(order.id, value as CommerceOrderStatus)}
            >
              <SelectTrigger
                aria-label={`Status for order ${order.id}`}
                className="h-11 min-w-36 bg-white capitalize"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {commerceOrderStatuses.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-5">
            <p className="text-sm leading-6 text-[#5f5b57]">
              {order.items.map((item) => `${item.product} · ${item.color} × ${item.quantity}`).join(", ")}
            </p>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-sm text-[#6f6a65]">{order.notes || "No order notes"}</span>
              <span className="font-semibold">{currency(order.totalPaise)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProductsPanel({
  products,
  categories,
  onRefresh,
  onMessage,
}: {
  products: CommerceProduct[];
  categories: CommerceCategory[];
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [editing, setEditing] = useState<CommerceProduct | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fabricTypeId, setFabricTypeId] = useState("");
  const [designId, setDesignId] = useState("");
  const [newFabricType, setNewFabricType] = useState("");
  const [newDesign, setNewDesign] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [storedImageUrls, setStoredImageUrls] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [active, setActive] = useState(true);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [pending, setPending] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
    setFabricTypeId("");
    setDesignId("");
    setNewFabricType("");
    setNewDesign("");
    setImageUrls("");
    setStoredImageUrls([]);
    setImageFiles([]);
    setActive(true);
    setVariants([emptyVariant()]);
    setEditorOpen(false);
  }

  function edit(product: CommerceProduct) {
    setEditing(product);
    setName(product.name);
    setDescription(product.description ?? "");
    setFabricTypeId(product.fabricTypeId ? String(product.fabricTypeId) : "");
    setDesignId(product.designId ? String(product.designId) : "");
    setNewFabricType(product.fabricTypeId ? "" : product.fabricType ?? "");
    setNewDesign(product.designId ? "" : product.design ?? "");
    setImageUrls(
      product.imageUrls
        .filter((url) => !url.startsWith("/api/commerce/product-images/"))
        .join("\n"),
    );
    setStoredImageUrls(
      product.imageUrls.filter((url) => url.startsWith("/api/commerce/product-images/")),
    );
    setImageFiles([]);
    setActive(product.active);
    setVariants(
      product.variants.map((variant) => ({
        color: variant.color,
        sku: variant.sku,
        priceRupees: String(variant.pricePaise / 100),
        minimumOrderQuantity: String(variant.minimumOrderQuantity),
        stockStatus: variant.stockStatus,
      })),
    );
    setEditorOpen(true);
  }

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((current) => current.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  }

  async function removeStoredImage(url: string) {
    const imageId = Number(url.split("/").pop());
    if (!Number.isInteger(imageId)) {
      onMessage("The stored image reference is invalid.");
      return;
    }
    setPending(true);
    try {
      await responseBody(
        await fetch(`/api/commerce/product-images/${imageId}`, { method: "DELETE" }),
        "The image could not be removed.",
      );
      setStoredImageUrls((current) => current.filter((item) => item !== url));
      await onRefresh();
      onMessage("The product image was removed.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The image could not be removed.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = {
        name,
        description,
        fabricTypeId: fabricTypeId ? Number(fabricTypeId) : null,
        designId: designId ? Number(designId) : null,
        fabricType: fabricTypeId ? "" : newFabricType,
        design: designId ? "" : newDesign,
        imageUrl: "",
        imageUrls: imageUrls
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
        active,
        variants: variants.map((variant) => ({
          color: variant.color,
          sku: variant.sku,
          pricePaise: Math.round(Number(variant.priceRupees) * 100),
          minimumOrderQuantity: Number(variant.minimumOrderQuantity),
          stockStatus: variant.stockStatus,
        })),
      };
      const saved = await responseBody<{ productId: number }>(
        await fetch(editing ? `/api/commerce/products/${editing.id}` : "/api/commerce/products", {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        "The product could not be saved.",
      );
      for (const file of imageFiles) {
        const form = new FormData();
        form.set("image", file);
        await responseBody(
          await fetch(`/api/commerce/products/${saved.productId}/images`, {
            method: "POST",
            body: form,
          }),
          `${file.name} could not be uploaded.`,
        );
      }
      await onRefresh();
      onMessage(`${name} was saved.`);
      reset();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The product could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#252a30]">Product catalog</h3>
          <p className="mt-1 text-sm text-[#6f6a65]">{products.length} {products.length === 1 ? "product" : "products"} available to manage.</p>
        </div>
        <Button type="button" className="h-11" onClick={() => { reset(); setEditorOpen(true); }}>
          <Plus aria-hidden="true" /> Add product
        </Button>
      </div>
      <div className="space-y-3">
        {products.length ? products.map((product) => (
          <Card key={product.id} className="gap-3 border-[#ded7cc] py-4 shadow-none">
            <CardHeader className="flex-row items-start justify-between px-5">
              <div>
                <CardTitle>{product.name}</CardTitle>
                <p className="mt-1 text-sm text-[#6f6a65]">
                  {[product.fabricType, product.design].filter(Boolean).join(" · ") || "Uncategorized"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={product.active ? "secondary" : "outline"}>
                  {product.active ? "Active" : "Archived"}
                </Badge>
                <Button type="button" variant="outline" className="h-11" onClick={() => edit(product)}>
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 px-5">
              {product.variants.map((variant) => (
                <Badge key={variant.id} variant="outline">
                  {variant.color} · {variant.sku} · {currency(variant.pricePaise)}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )) : (
          <EmptyState
            icon={Boxes}
            title="No products yet"
            message="Add the first product and its variants to open the dealer catalog."
            action={<Button type="button" className="h-11" onClick={() => { reset(); setEditorOpen(true); }}><Plus aria-hidden="true" /> Add product</Button>}
          />
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={(open) => { if (!open && !pending) reset(); else setEditorOpen(open); }}>
        <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-[#fffcf7] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Add product"}</DialogTitle>
            <DialogDescription>Keep catalog details, images, pricing, and stock variants together.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit} autoComplete="off">
            <Field label="Product name" value={name} onChange={setName} required />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fabric-type">Fabric type</Label>
                <Select value={fabricTypeId || "none"} onValueChange={(value) => setFabricTypeId(value === "none" ? "" : value)}>
                  <SelectTrigger id="fabric-type" className="mt-2 h-11 w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.filter((category) => category.type === "fabric_type" && category.active).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="design">Design</Label>
                <Select value={designId || "none"} onValueChange={(value) => setDesignId(value === "none" ? "" : value)}>
                  <SelectTrigger id="design" className="mt-2 h-11 w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.filter((category) => category.type === "design" && category.active).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New fabric type" value={newFabricType} onChange={(value) => { setNewFabricType(value); if (value) setFabricTypeId(""); }} />
              <Field label="New design" value={newDesign} onChange={(value) => { setNewDesign(value); if (value) setDesignId(""); }} />
            </div>
            <div>
              <Label htmlFor="product-description">Description</Label>
              <Textarea id="product-description" className="mt-2" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="product-images">Image URLs</Label>
              <Textarea
                id="product-images"
                className="mt-2"
                value={imageUrls}
                onChange={(event) => setImageUrls(event.target.value)}
                placeholder="One HTTPS image URL per line"
              />
            </div>
            <div>
              <Label htmlFor="product-image-files">Upload images to Neon</Label>
              <input id="product-image-files" className="sr-only" type="file" accept="image/*" multiple onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))} />
              <Label htmlFor="product-image-files" className="mt-2 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#cfc6ba] bg-white px-4 text-sm font-semibold text-[#34333a] transition-[background-color,border-color] hover:border-[#b65a38] hover:bg-[#fbf7f1]">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {imageFiles.length ? `${imageFiles.length} selected` : "Choose image files"}
              </Label>
              <p className="mt-1 text-xs text-[#6f6a65]">Up to 4 MB per image.</p>
            </div>
            {storedImageUrls.length ? (
              <div className="space-y-2">
                <Label>Images stored in Neon</Label>
                {storedImageUrls.map((url, index) => (
                  <div key={url} className="flex items-center justify-between gap-3 rounded-xl border border-[#ded7cc] px-3 py-2">
                    <span className="truncate text-sm text-[#5f5b57]">Image {index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10"
                      disabled={pending}
                      onClick={() => removeStoredImage(url)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-xl border border-[#ded7cc] p-3">
              <Label htmlFor="product-active">Available in catalog</Label>
              <Switch id="product-active" checked={active} onCheckedChange={setActive} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Variants</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setVariants((current) => [...current, emptyVariant()])}>
                  <Plus aria-hidden="true" /> Add
                </Button>
              </div>
              {variants.map((variant, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-[#ded7cc] p-3">
                  <Input aria-label={`Variant ${index + 1} color`} placeholder="Color" value={variant.color} onChange={(event) => updateVariant(index, { color: event.target.value })} required />
                  <Input aria-label={`Variant ${index + 1} SKU`} placeholder="SKU" value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} required />
                  <Input aria-label={`Variant ${index + 1} price in rupees`} type="number" min="0.01" step="0.01" placeholder="Price ₹" value={variant.priceRupees} onChange={(event) => updateVariant(index, { priceRupees: event.target.value })} required />
                  <Input aria-label={`Variant ${index + 1} minimum order quantity`} type="number" min="1" placeholder="MOQ" value={variant.minimumOrderQuantity} onChange={(event) => updateVariant(index, { minimumOrderQuantity: event.target.value })} required />
                  <Select value={variant.stockStatus} onValueChange={(value) => updateVariant(index, { stockStatus: value as VariantDraft["stockStatus"] })}>
                    <SelectTrigger className="col-span-2 h-11 w-full bg-white" aria-label={`Variant ${index + 1} stock status`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_stock">In stock</SelectItem>
                      <SelectItem value="low_stock">Low stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of stock</SelectItem>
                    </SelectContent>
                  </Select>
                  {variants.length > 1 ? (
                    <Button type="button" variant="ghost" className="col-span-2 h-11" onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}>
                      Remove variant
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-[#ded7cc] bg-[#fffcf7]/95 px-6 py-4 backdrop-blur">
              <Button className="h-11 flex-1" disabled={pending}>{pending ? "Saving…" : "Save product"}</Button>
              <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={reset}>Cancel</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountsPanel({
  accounts,
  dealerOptions,
  onAccountsChange,
  onMessage,
}: {
  accounts: CommerceAccount[];
  dealerOptions: DealerOption[];
  onAccountsChange: (accounts: CommerceAccount[]) => void;
  onMessage: (message: string) => void;
}) {
  const [role, setRole] = useState<"retailer" | "operations_staff">("retailer");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [pending, setPending] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [replacementPassword, setReplacementPassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState<CommerceAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const body = await responseBody<{ accounts: CommerceAccount[] }>(
        await fetch("/api/commerce/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role,
            displayName,
            username,
            password,
            dealerId: role === "retailer" ? Number(dealerId) : undefined,
            phone: role === "retailer" ? phone : undefined,
            shopName: role === "retailer" ? shopName : undefined,
          }),
        }),
        "The account could not be created.",
      );
      onAccountsChange(body.accounts);
      onMessage(`${displayName}'s account was created.`);
      setDisplayName("");
      setUsername("");
      setPassword("");
      setDealerId("");
      setPhone("");
      setShopName("");
      setCreatorOpen(false);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The account could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function toggleOperations(account: CommerceAccount, enabled: boolean) {
    try {
      const body = await responseBody<{ accounts: CommerceAccount[] }>(
        await fetch("/api/commerce/accounts", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ authUserId: account.authUserId, enabled }),
        }),
        "Operations access could not be updated.",
      );
      onAccountsChange(body.accounts);
      onMessage(`${account.displayName}'s operations access was updated.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The account could not be updated.");
    }
  }

  async function resetPassword(account: CommerceAccount) {
    try {
      await responseBody(
        await fetch("/api/commerce/accounts", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            authUserId: account.authUserId,
            password: replacementPassword,
          }),
        }),
        "The password could not be reset.",
      );
      setResettingId(null);
      setReplacementPassword("");
      onMessage(`${account.displayName}'s password was replaced and existing sessions were revoked.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The password could not be reset.");
    }
  }

  async function toggleActive(account: CommerceAccount, active: boolean) {
    try {
      const body = await responseBody<{ accounts: CommerceAccount[] }>(
        await fetch("/api/commerce/accounts", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ authUserId: account.authUserId, active }),
        }),
        "The account status could not be updated.",
      );
      onAccountsChange(body.accounts);
      onMessage(`${account.displayName} was ${active ? "activated" : "deactivated"}.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The account could not be updated.");
    }
  }

  async function deleteAccount(account: CommerceAccount) {
    setDeleting(true);
    try {
      const body = await responseBody<{
        accounts: CommerceAccount[];
        warning?: string;
      }>(
        await fetch("/api/commerce/accounts", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ authUserId: account.authUserId }),
        }),
        "The account could not be deleted.",
      );
      onAccountsChange(body.accounts);
      setDeletingAccount(null);
      onMessage(
        body.warning ??
          `${account.displayName}'s account was deleted. Past orders were retained.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The account could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#252a30]">Workspace accounts</h3>
          <p className="mt-1 text-sm text-[#6f6a65]">{accounts.length} secure {accounts.length === 1 ? "account" : "accounts"} across retail and operations.</p>
        </div>
        <Button type="button" className="h-11" onClick={() => setCreatorOpen(true)}>
          <Plus aria-hidden="true" /> Create account
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {accounts.map((account) => {
          const retailer = account.roles.includes("retailer");
          const operations = account.roles.includes("operations_staff");
          const deletable = canDeleteCommerceAccount({
            roles: account.roles,
            salespersonId: account.salespersonId,
          });
          return (
            <Card key={account.authUserId} className="gap-3 border-[#ded7cc] py-4 shadow-none">
              <CardHeader className="px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{account.displayName}</CardTitle>
                    <div className="flex flex-wrap gap-1">
                      {account.roles.map((accountRole) => (
                        <Badge key={accountRole} variant="outline" className="capitalize">
                          {accountRole.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-[#6f6a65]">
                    @{account.username}{account.salesperson ? ` · ${account.salesperson}` : ""}{account.dealer ? ` · ${account.dealer}` : ""}
                  </p>
                </div>
              </CardHeader>
              {!retailer ? (
                <CardContent className="flex items-center justify-between px-5">
                  <div>
                    <p className="text-sm font-medium">Commerce operations</p>
                    <p className="text-xs text-[#6f6a65]">Catalog and order-processing access</p>
                  </div>
                  <Switch
                    aria-label={`Commerce operations access for ${account.displayName}`}
                    checked={operations}
                    disabled={account.roles.length === 1 && operations}
                    onCheckedChange={(checked) => toggleOperations(account, checked)}
                  />
                </CardContent>
              ) : null}
              <CardContent className="px-5">
                {retailer ? (
                  <div className="mb-4 flex items-center justify-between rounded-xl border border-[#ded7cc] p-3">
                    <div>
                      <p className="text-sm font-medium">Retailer access</p>
                      <p className="text-xs text-[#6f6a65]">
                        {[account.shopName, account.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                    <Switch
                      aria-label={`Retailer access for ${account.displayName}`}
                      checked={account.active}
                      onCheckedChange={(checked) => toggleActive(account, checked)}
                    />
                  </div>
                ) : null}
                {resettingId === account.authUserId ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="password"
                      name={`replacement-password-${account.authUserId}`}
                      autoComplete="new-password"
                      aria-label={`New password for ${account.displayName}`}
                      placeholder="New password, at least 8 characters"
                      value={replacementPassword}
                      minLength={8}
                      onChange={(event) => setReplacementPassword(event.target.value)}
                    />
                    <Button
                      type="button"
                      className="h-11"
                      disabled={replacementPassword.length < 8}
                      onClick={() => resetPassword(account)}
                    >
                      Replace password
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11"
                      onClick={() => {
                        setResettingId(null);
                        setReplacementPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setResettingId(account.authUserId)}
                    >
                      Reset password
                    </Button>
                    {deletable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 text-[#a34332] transition-[background-color,color,transform] hover:bg-[#f8e8e3] hover:text-[#8f3527] active:scale-[0.97]"
                        onClick={() => setDeletingAccount(account)}
                      >
                        <Trash2 aria-hidden="true" /> Delete account
                      </Button>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={creatorOpen} onOpenChange={(open) => { if (!pending) setCreatorOpen(open); }}>
        <DialogContent className="max-h-[calc(100svh-24px)] overflow-y-auto rounded-2xl border-[#ded7cc] bg-[#fffcf7] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create account</DialogTitle>
            <DialogDescription>Create a username/password login and grant only the access this person needs.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createAccount} autoComplete="off">
            <div>
              <Label htmlFor="account-role">Account type</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger id="account-role" className="mt-2 h-11 w-full bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retailer">Retailer</SelectItem>
                  <SelectItem value="operations_staff">Operations staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "retailer" ? (
              <>
                <div>
                  <Label htmlFor="account-dealer">Dealer</Label>
                  <SearchableSelect
                    id="account-dealer"
                    value={dealerId || undefined}
                    onValueChange={setDealerId}
                    options={dealerOptions.map((dealer) => ({ value: String(dealer.id), label: `${dealer.name} · ${dealer.pincode}`, keywords: dealer.pincode }))}
                    placeholder="Choose a dealer"
                    searchPlaceholder="Search dealers or PIN codes"
                    emptyText="No dealers match"
                    required
                    className="mt-2 bg-white"
                  />
                </div>
                <Field label="Shop name" name="new-account-shop" autoComplete="organization" value={shopName} onChange={setShopName} />
                <Field label="Phone" name="new-account-phone" autoComplete="tel" inputMode="tel" value={phone} onChange={setPhone} />
              </>
            ) : null}
            <Field label="Display name" name="new-account-display-name" autoComplete="name" value={displayName} onChange={setDisplayName} required />
            <Field label="Username" name="new-account-username" autoComplete="off" value={username} onChange={setUsername} required />
            <Field label="Initial password" name="new-account-password" autoComplete="new-password" type="password" value={password} onChange={setPassword} required minLength={8} />
            <DialogFooter className="border-t border-[#ded7cc] pt-4">
              <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => setCreatorOpen(false)}>Cancel</Button>
              <Button className="h-11" disabled={pending || (role === "retailer" && !dealerId)}>
                <ShieldCheck aria-hidden="true" /> {pending ? "Creating…" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deletingAccount)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingAccount(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl border-[#ded7cc] bg-white text-[#252a30] shadow-[0_24px_70px_rgba(37,42,48,0.24)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-[#6f6a65]">
              {deletingAccount
                ? `@${deletingAccount.username} will lose sign-in and commerce access immediately. Past orders will stay in order history. This cannot be undone.`
                : "This account will lose access immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep account</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !deletingAccount}
              onClick={(event) => {
                event.preventDefault();
                if (deletingAccount) void deleteAccount(deletingAccount);
              }}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  minLength,
  name,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  name?: string;
  autoComplete?: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} autoComplete={autoComplete} inputMode={inputMode} className="mt-2 h-11" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} minLength={minLength} />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: typeof Boxes;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#d6cfc4] bg-white p-8 text-center">
      <div>
        <Icon className="mx-auto h-7 w-7 text-[#6f6a65]" aria-hidden="true" />
        <p className="mt-3 font-semibold text-[#252a30]">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#6f6a65]">{message}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
