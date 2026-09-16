"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Loader2, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithUsername } from "@/lib/session-api";

export default function AuthPage() {
  const params = useParams<{ path: string }>();
  const router = useRouter();
  const isSignIn = params.path === "sign-in";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignIn) router.replace("/auth/sign-in");
  }, [isSignIn, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      await signInWithUsername(username, password);
      // A document navigation makes sure the browser commits the auth cookies
      // from the login response before the protected workspace is requested.
      window.location.replace("/");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!isSignIn) {
    return null;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef0ed] px-4 py-10 text-[#18221f]">
      <section className="w-full max-w-md rounded-2xl border border-[#d9dedb] bg-white p-6 shadow-[0_24px_70px_rgba(15,31,27,0.12)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#d9f36b] text-[#173a34]">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold tracking-[-0.02em]">Dealer Territory Map</p>
            <p className="text-sm text-[#6e7874]">Telangana + Andhra Pradesh</p>
          </div>
        </div>

        <div className="mt-8">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            Sign in to the workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#66716d]">
            Use the username provided by your administrator to access your assigned dealers and routes.
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {message ? (
            <p role="alert" className="rounded-lg bg-[#fff3f1] px-3 py-2 text-sm text-[#9f3429]">
              {message}
            </p>
          ) : null}

          <Button
            className="h-11 w-full bg-[#173a34] text-white transition-[background-color,transform] hover:bg-[#214b43] active:scale-[0.98]"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Sign in
            {!pending ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-[#6e7874]">
          Ask the administrator to create or reset a salesperson account.
        </p>
      </section>
    </main>
  );
}
