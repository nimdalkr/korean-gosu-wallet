"use server";

import { redirect } from "next/navigation";
import { destroySession, requireSession } from "@/lib/session";

export async function logout() {
  await requireSession();
  await destroySession();
  redirect("/login");
}
