'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const isOn = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-in">
        {links.map((l) => <Link key={l.href} href={l.href} className={isOn(l.href) ? 'on' : ''}>{l.label}</Link>)}
      </div>
    </nav>
  );
}
