import { useState } from "react";
import { api } from "../api";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = isSignup
        ? await api.signUp({ email, password })
        : await api.logIn({ email, password });
      onAuthenticated(user);
    } catch (err) {
      setError(err.message.includes("409")
        ? "An account already exists for this email. Sign in instead."
        : err.message.includes("401")
          ? "Email or password is incorrect."
          : err.message.includes("422")
            ? "Enter a valid email and a password of at least 10 characters."
            : "Unable to connect. Check the server and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] border border-line bg-bg1 shadow-2xl">
        <section className="hidden lg:flex flex-col justify-between min-h-[560px] p-10 border-r border-line bg-bg0 bg-grid">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-good">Forgesight / plant intelligence</p>
            <h1 className="mt-8 text-5xl leading-tight">Steel quality,<br />in clear view.</h1>
            <p className="mt-5 max-w-sm text-mid leading-7">Production monitoring and quality insight for your manufacturing floor.</p>
          </div>
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-5 font-mono text-xs text-low">
            <span>LIVE MONITORING</span><span>QUALITY ANALYTICS</span><span>PROCESS CONTROL</span>
          </div>
        </section>

        <section className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <div className="lg:hidden mb-10">
            <p className="font-mono text-xs uppercase tracking-widest text-good">Forgesight</p>
            <h1 className="mt-3 text-3xl">Steel quality, in clear view.</h1>
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-low">Account access</p>
          <h2 className="mt-2 text-2xl">{isSignup ? "Create your account" : "Welcome back"}</h2>
          <p className="mt-2 text-sm text-mid">{isSignup ? "Register to access your production workspace." : "Sign in to your production workspace."}</p>

          <div className="mt-7 grid grid-cols-2 border-b border-line" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={!isSignup} onClick={() => { setMode("login"); setError(""); }} className={`py-3 text-sm border-b-2 ${!isSignup ? "border-good text-hi" : "border-transparent text-low hover:text-mid"}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={isSignup} onClick={() => { setMode("signup"); setError(""); }} className={`py-3 text-sm border-b-2 ${isSignup ? "border-good text-hi" : "border-transparent text-low hover:text-mid"}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-mid">
              Work email
              <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full border border-line-strong bg-bg0 px-3 py-3 text-hi outline-none focus:border-good" placeholder="name@company.com" />
            </label>
            <label className="block text-sm text-mid">
              Password
              <input type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full border border-line-strong bg-bg0 px-3 py-3 text-hi outline-none focus:border-good" placeholder="At least 10 characters" />
            </label>
            {error && <p role="alert" className="border-l-2 border-danger bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
            <button disabled={submitting} className="w-full bg-good px-4 py-3 font-display text-sm uppercase tracking-wider text-bg0 transition-opacity hover:opacity-90 disabled:opacity-50">
              {submitting ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-xs leading-5 text-low">Your password is securely hashed. Sessions expire after 7 days.</p>
        </section>
      </div>
    </main>
  );
}