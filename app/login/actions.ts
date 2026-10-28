"use server";

import { redirect } from "next/navigation";

import { translateAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error: string | null;
  success: string | null;
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Completa todos los campos", success: null };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: translateAuthError(error), success: null };
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");
}