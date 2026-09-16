import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";

export function proxy(request: NextRequest) {
  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
}

export const config = {
  matcher: ["/"],
};
