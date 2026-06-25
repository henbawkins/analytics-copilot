"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect passcode.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

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
      <form onSubmit={submit} style={{ textAlign: "center", width: 320 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Analytics Copilot</h1>
        <p style={{ color: "#9aa3b2", marginBottom: 24, fontSize: 14 }}>
          Agency-internal. Enter the team passcode to continue.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Team passcode"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#161a22",
            color: "#e6e9ef",
            border: "1px solid #2a313d",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 15,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: "100%",
            background: loading ? "#1e40af" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 15,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Checking…" : "Enter"}
        </button>
        {error && (
          <p style={{ color: "#f87171", marginTop: 16, fontSize: 13 }}>{error}</p>
        )}
      </form>
    </main>
  );
}
