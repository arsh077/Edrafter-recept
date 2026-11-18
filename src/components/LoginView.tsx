import React, { useState } from 'react';
import { ArrowRight, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_URL, ErrorBanner } from './UiPrimitives';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'admin@edrafter.in', pass: 'Admin@123' },
  { label: 'Admin', email: 'manager@edrafter.in', pass: 'Manager@123' },
  { label: 'Accounts', email: 'accounts@edrafter.in', pass: 'Accounts@123' },
  { label: 'Staff', email: 'staff@edrafter.in', pass: 'Staff@123' },
];

export function LoginView() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('admin@edrafter.in');
  const [password, setPassword] = useState('Admin@123');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed or was cancelled.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      const codeHint = json.data?.demoResetCode ? ` Verification Code: ${json.data.demoResetCode}` : '';
      setNotice(`${json.message}${codeHint}`);
      setMode('reset');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request reset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetCode, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setNotice(json.message);
      setPassword(newPassword);
      setMode('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Column */}
      <div className="lg:col-span-5 bg-[#310D35] text-white p-8 lg:p-12 flex flex-col justify-between">
        <div>
          <div className="inline-block bg-white rounded-xl px-4 py-3">
            <img
              src={BRAND_LOGO_URL}
              alt="eDrafter — Crafting Legal Solutions"
              referrerPolicy="no-referrer"
              className="h-11 w-auto object-contain"
            />
          </div>
          <h1 className="mt-10 text-3xl font-bold tracking-tight text-white max-w-md text-balance">
            Legal Documentation, Payment Collection &amp; Receipt Portal
          </h1>
          <p className="mt-4 text-sm text-white/80 leading-relaxed max-w-md">
            Centralized operations workspace for Indian legal service orders, verified INR payment
            reconciliation, GST-compliant fee breakdowns, and QR-verifiable A4 receipts.
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-white/15 space-y-3 text-xs text-white/80">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#83C441] shrink-0" />
            <span>Immutable receipt numbering (EDR/PR/2026-27) with audit trail</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#008C98] shrink-0" />
            <span>Role-based access across Super Admin, Admin, Accounts &amp; Staff</span>
          </div>
        </div>
      </div>

      {/* Right Sign-In Column */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md bg-white border border-[#E8E6EC] rounded-xl p-7 md:p-9">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#25212B]">
              {mode === 'login' && 'Sign in to eDrafter Portal'}
              {mode === 'forgot' && 'Reset Staff Password'}
              {mode === 'reset' && 'Enter Reset Verification Code'}
            </h2>
            <p className="text-xs text-[#777481] mt-1">
              {mode === 'login' && 'Use your staff credentials or Google Workspace account.'}
              {mode === 'forgot' && 'Enter your registered staff email to receive a reset code.'}
              {mode === 'reset' && 'Set a new password using the 6-digit verification code.'}
            </p>
          </div>

          {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
          {notice && (
            <div className="mb-4 p-3 rounded-lg bg-[#E6F6F8] border border-[#B2E1E6] text-xs text-[#005F68]">
              {notice}
            </div>
          )}

          {mode === 'login' && (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-[#25212B] mb-1.5">
                    Staff Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#777481] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E8E6EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#310D35]"
                      placeholder="admin@edrafter.in"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-medium text-[#25212B]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('forgot');
                      }}
                      className="text-xs font-medium text-[#008C98] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#777481] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E8E6EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#310D35]"
                      placeholder="Enter password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C] disabled:opacity-60 transition-colors"
                >
                  <span>{submitting ? 'Signing in...' : 'Sign In with Email'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#E8E6EC]" />
                <span className="text-[11px] text-[#777481]">OR</span>
                <div className="h-px flex-1 bg-[#E8E6EC]" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 text-sm font-medium text-[#25212B] bg-white border border-[#E8E6EC] rounded-lg hover:bg-[#F7F8FA] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Quick Demo Role Switcher */}
              <div className="mt-6 pt-5 border-t border-[#E8E6EC]">
                <p className="text-[11px] font-medium text-[#777481] mb-2">
                  Quick Fill Staff Role Credentials:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword(acc.pass);
                      }}
                      className="px-2 py-1.5 text-[11px] font-medium text-[#310D35] bg-[#F7F8FA] border border-[#E8E6EC] rounded hover:bg-[#EFECEF] truncate"
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-medium text-[#25212B] mb-1.5">
                  Staff Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
                >
                  {submitting ? 'Generating Code...' : 'Generate Reset Code'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="py-2.5 px-4 text-sm font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label htmlFor="reset-code" className="block text-xs font-medium text-[#25212B] mb-1.5">
                  6-Digit Reset Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#777481] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-code"
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono border border-[#E8E6EC] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="reset-pass" className="block text-xs font-medium text-[#25212B] mb-1.5">
                  New Password
                </label>
                <input
                  id="reset-pass"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#E8E6EC] rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#310D35] rounded-lg hover:bg-[#46164C]"
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="py-2.5 px-4 text-sm font-medium text-[#25212B] border border-[#E8E6EC] rounded-lg"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
