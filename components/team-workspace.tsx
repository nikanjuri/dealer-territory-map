"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Dealer } from "@/app/dealers";
import { getSalespersonColor } from "@/app/dealers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SalespersonAccount } from "@/lib/access-contract";
import { assignDealersToSalesperson } from "@/lib/dealer-api";
import {
  createSalespersonAccount,
  setSalespersonCredentials,
} from "@/lib/session-api";

function CreateSalespersonDialog({
  onCreated,
}: {
  onCreated: (salesperson: SalespersonAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { salesperson } = await createSalespersonAccount({
        displayName,
        username,
        password,
      });
      onCreated(salesperson);
      setOpen(false);
      setDisplayName("");
      setUsername("");
      setPassword("");
      toast.success(`${salesperson.displayName} can now sign in.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The salesperson could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-[#d9f36b] text-[#173a34] hover:bg-[#cce960]">
          <UserPlus className="h-4 w-4" /> Add salesperson
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-[#d9dedb] bg-white text-[#18221f] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a salesperson</DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            Create a private login and link it to a salesperson. A matching existing salesperson record will be reused.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-display-name">Full name</Label>
            <Input
              id="team-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              placeholder="Kiran Kumar"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-username">Username</Label>
            <Input
              id="team-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              placeholder="kiran"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              minLength={3}
              maxLength={40}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-password">Temporary password</Label>
            <Input
              id="team-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <p className="text-xs text-[#74807c]">At least 8 characters. Share it privately with the salesperson.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#173a34] text-white hover:bg-[#214b43]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Create login
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function suggestedUsername(displayName: string) {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function SalespersonCredentialsDialog({
  person,
  onUpdated,
}: {
  person: SalespersonAccount;
  onUpdated: (salesperson: SalespersonAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(
    person.username ?? suggestedUsername(person.displayName),
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const hasLogin = Boolean(person.username);

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setUsername(person.username ?? suggestedUsername(person.displayName));
      setPassword("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await setSalespersonCredentials(person.id, {
        username: hasLogin ? undefined : username,
        password,
      });
      onUpdated(result.salesperson);
      setOpen(false);
      setPassword("");
      toast.success(
        result.passwordReset
          ? `${person.displayName}'s password was reset.`
          : `${person.displayName} can now sign in as @${result.salesperson.username}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The salesperson login could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.97]"
        >
          <KeyRound className="h-4 w-4" />
          {hasLogin ? "Reset password" : "Set up login"}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-[#d9dedb] bg-white text-[#18221f] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasLogin
              ? `Reset ${person.displayName}'s password`
              : `Set up ${person.displayName}'s login`}
          </DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            {hasLogin
              ? `The username is @${person.username}. The saved password cannot be viewed; setting a new one replaces it immediately.`
              : "Choose the username and initial password this salesperson will use to sign in."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`team-username-${person.id}`}>Username</Label>
            <Input
              id={`team-username-${person.id}`}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              minLength={3}
              maxLength={40}
              disabled={hasLogin}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`team-password-${person.id}`}>
              {hasLogin ? "New password" : "Initial password"}
            </Label>
            <Input
              id={`team-password-${person.id}`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <p className="text-xs leading-5 text-[#74807c]">
              At least 8 characters. Share it privately; it will not be shown again.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#173a34] text-white hover:bg-[#214b43]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {hasLogin ? "Reset password" : "Create login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDealersDialog({
  person,
  dealers,
  onAssigned,
}: {
  person: SalespersonAccount;
  dealers: Dealer[];
  onAssigned: (dealers: Dealer[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const assignedCount = dealers.filter(
    (dealer) => dealer.salesperson === person.normalizedName,
  ).length;
  const availableDealers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dealers.filter((dealer) => {
      if (dealer.salesperson === person.normalizedName) return false;
      if (!normalizedQuery) return true;
      return [
        dealer.dealer,
        dealer.area,
        dealer.pincode,
        dealer.salesperson,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [dealers, person.normalizedName, query]);

  function close() {
    if (saving) return;
    setOpen(false);
    setQuery("");
    setSelectedIds([]);
  }

  async function assignSelected() {
    if (!selectedIds.length) return;
    setSaving(true);
    try {
      const result = await assignDealersToSalesperson(person.id, selectedIds);
      onAssigned(result.dealers);
      toast.success(
        `${result.assigned} ${result.assigned === 1 ? "dealer" : "dealers"} assigned to ${person.displayName}.`,
      );
      setOpen(false);
      setQuery("");
      setSelectedIds([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The dealers could not be assigned.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 border-[#cfd6d2] bg-white text-[#35413d] transition-transform active:scale-[0.97]"
        >
          <Building2 className="h-4 w-4" /> Assign dealers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-24px)] gap-0 overflow-hidden rounded-2xl border-[#d9dedb] bg-white p-0 text-[#18221f] sm:max-w-2xl">
        <DialogHeader className="border-b border-[#e1e5e3] px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Assign dealers to {person.displayName}</DialogTitle>
          <DialogDescription className="leading-6 text-[#66716d]">
            {assignedCount} {assignedCount === 1 ? "dealer is" : "dealers are"} currently assigned. Selected dealers will move from their current salesperson.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-[#e1e5e3] p-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#75807c]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dealer, area, PIN or current salesperson"
              aria-label="Search dealers to assign"
              className="h-11 border-[#cfd6d2] bg-[#fbfcfb] pl-9 text-[#18221f]"
            />
          </div>
        </div>

        <div className="max-h-[min(460px,52svh)] overflow-y-auto p-2 sm:p-3">
          {availableDealers.length ? (
            <ul className="space-y-1">
              {availableDealers.map((dealer) => {
                const selected = selectedIds.includes(dealer.id);
                return (
                  <li key={dealer.id}>
                    <label className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color] ${selected ? "border-[#9aada6] bg-[#f1f6f3]" : "border-transparent hover:bg-[#f6f8f6]"}`}>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() =>
                          setSelectedIds((current) =>
                            selected
                              ? current.filter((id) => id !== dealer.id)
                              : [...current, dealer.id],
                          )
                        }
                        aria-label={`Assign ${dealer.dealer} to ${person.displayName}`}
                        className="h-5 w-5 border-[#aeb8b3] data-[state=checked]:border-[#173a34] data-[state=checked]:bg-[#173a34]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#26312e]">
                          {dealer.dealer}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#74807c]">
                          {dealer.area} · {dealer.pincode}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef1ef] px-2.5 py-1 text-[11px] font-semibold text-[#596560]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: getSalespersonColor(
                              dealer.salesperson,
                            ),
                          }}
                          aria-hidden="true"
                        />
                        <span className="max-w-28 truncate">
                          {dealer.salesperson}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid min-h-44 place-items-center px-6 text-center">
              <div>
                <CheckCircle2 className="mx-auto h-6 w-6 text-[#708078]" />
                <p className="mt-3 text-sm font-semibold text-[#26312e]">
                  {query ? "No matching dealers" : "All dealers are assigned here"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#74807c]">
                  {query
                    ? "Try another dealer, area, PIN code, or salesperson."
                    : `${person.displayName} already covers every dealer in the workspace.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-[#e1e5e3] bg-[#f8faf8] px-4 py-4 sm:px-6">
          <div className="mr-auto self-center text-xs font-semibold text-[#66716d]">
            {selectedIds.length} selected
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={assignSelected}
            disabled={!selectedIds.length || saving}
            className="bg-[#173a34] text-white transition-transform hover:bg-[#214b43] active:scale-[0.97]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving
              ? "Assigning…"
              : `Assign ${selectedIds.length || ""} ${selectedIds.length === 1 ? "dealer" : "dealers"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamWorkspace({
  active,
  salespeople,
  dealers,
  onCreated,
  onAccountUpdated,
  onDealersAssigned,
}: {
  active: boolean;
  salespeople: SalespersonAccount[];
  dealers: Dealer[];
  onCreated: (salesperson: SalespersonAccount) => void;
  onAccountUpdated: (salesperson: SalespersonAccount) => void;
  onDealersAssigned: (dealers: Dealer[]) => void;
}) {
  return (
    <section
      id="team-workspace-panel"
      hidden={!active}
      aria-labelledby="team-workspace-title"
      className="h-[calc(100svh-120px)] overflow-y-auto bg-[#eef0ed]"
    >
      <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#73807b]">Administration</p>
            <h2 id="team-workspace-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Salespeople
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716d]">
              Each login is scoped to one salesperson’s dealers, territories, routes, and visits.
            </p>
          </div>
          <CreateSalespersonDialog onCreated={onCreated} />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-[#d8ddda] bg-white shadow-[0_8px_24px_rgba(25,38,34,0.05)]">
          <div className="flex items-center justify-between border-b border-[#e1e5e3] bg-[#f7f9f7] px-4 py-3 sm:px-5">
            <span className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Team access</span>
            <span className="text-xs font-semibold text-[#68746f]">{salespeople.length} salespeople</span>
          </div>
          <ul className="divide-y divide-[#e3e7e5]">
            {salespeople.map((person) => {
              const dealerCount = dealers.filter(
                (dealer) => dealer.salesperson === person.normalizedName,
              ).length;
              return (
              <li key={person.id} className="flex min-h-20 flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: person.color }}>
                  {person.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#26312e]">{person.displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-[#74807c]">
                    {person.username ? `@${person.username}` : "No login yet"}
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#68746f]">
                    {dealerCount} {dealerCount === 1 ? "dealer" : "dealers"}
                  </span>
                  <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold lg:inline-flex ${person.username && person.accountActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                    {person.username && person.accountActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {person.username && person.accountActive ? "Login active" : "Needs login"}
                  </span>
                  <SalespersonCredentialsDialog
                    person={person}
                    onUpdated={onAccountUpdated}
                  />
                  <AssignDealersDialog
                    person={person}
                    dealers={dealers}
                    onAssigned={onDealersAssigned}
                  />
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
