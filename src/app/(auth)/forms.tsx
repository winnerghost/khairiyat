"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Callout } from "@/components/ui/card";
import { errorProps, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  type AuthFormState,
  forgotAction,
  loginAction,
  resetAction,
  signupAction,
} from "./actions";

const initial: AuthFormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <input type="hidden" name="next" value={next ?? "/app"} />
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          {...errorProps("email", state.fieldErrors?.email)}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          {...errorProps("password", state.fieldErrors?.password)}
        />
      </Field>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
      <Link href="/forgot-password" className="text-center text-base text-primary underline">
        Forgot your password?
      </Link>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signupAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input
          name="name"
          autoComplete="name"
          required
          {...errorProps("name", state.fieldErrors?.name)}
        />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          {...errorProps("email", state.fieldErrors?.email)}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          {...errorProps("password", state.fieldErrors?.password, true)}
        />
      </Field>
      <SubmitButton pendingText="Creating your account…">Start free trial</SubmitButton>
      <p className="text-center text-sm text-muted">
        7 days free, no card needed. By continuing you agree to our{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

export function ForgotForm({ demo }: { demo: boolean }) {
  const [state, action] = useActionState(forgotAction, initial);
  if (state.message) {
    return (
      <Callout tone="success" role="status">
        {state.message}
        {demo && (
          <>
            {" "}
            Demo mode: open the{" "}
            <Link href="/demo/inbox" className="font-semibold underline">
              demo inbox
            </Link>{" "}
            to see the email.
          </>
        )}
      </Callout>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          {...errorProps("email", state.fieldErrors?.email)}
        />
      </Field>
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          {...errorProps("password", state.fieldErrors?.password, true)}
        />
      </Field>
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
