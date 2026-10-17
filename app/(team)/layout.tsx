/* Layout for every signed-in page: header, navigation (admin links for admins
 * only) and the sign-out button. Each page also checks the session itself. */
import Link from 'next/link';
import { requireUser } from '@/lib/session';
import NavLinks from './NavLinks';
import SignOut from './SignOut';

export const dynamic = 'force-dynamic';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    { href: '/', label: 'Home' },
    { href: '/log', label: 'Log interaction' },
    { href: '/visitors', label: 'Visitors' },
    { href: '/staff-register', label: 'Register visitor' },
    { href: '/podcast', label: 'Podcast' },
    ...(user.role === 'admin'
      ? [{ href: '/admin/export', label: 'Export' }, { href: '/admin/users', label: 'Team' }, { href: '/admin/settings', label: 'Settings' }]
      : []),
  ];
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" aria-label="Booth Hub home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mresult-logo-reversed.png" alt="MResult" width={132} height={26} />
          </Link>
          <span className="app">Booth Hub</span>
          <div className="who">
            <span>{user.displayName}{user.role === 'admin' ? ' · admin' : ''}</span>
            <SignOut />
          </div>
        </div>
      </header>
      <NavLinks links={links} />
      {children}
    </>
  );
}
