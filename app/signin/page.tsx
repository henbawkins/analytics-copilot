"use client";

import { signIn } from "next-auth/react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SignInInner() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b0d12",
        color: "#e6e9ef",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Analytics Copilot</h1>
        <p style={{ color: "#9aa3b2", marginBottom: 24, fontSize: 14 }}>
          Agency-internal. Sign in with an approved Google account.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          style={{
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Sign in with Google
        </button>
        {error === "AccessDenied" && (
          <p style={{ color: "#f87171", marginTop: 16, fontSize: 13 }}>
            That account isn&apos;t on the allowlist. Ask an admin to add it.
          </p>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
