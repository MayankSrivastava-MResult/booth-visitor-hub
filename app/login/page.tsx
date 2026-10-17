/* Team sign-in page (email + password). Already signed in → home. */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return (
    <>
      <header className="pub-head">
        <div className="pub-head-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mresult-logo-reversed.png" alt="MResult" width={142} height={28} />
          <h1>Booth Hub</h1>
          <p>For the MResult booth team.</p>
        </div>
      </header>
      <main className="page narrow"><LoginForm /></main>
    </>
  );
}
