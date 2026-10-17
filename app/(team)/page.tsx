/* Home for signed-in team members: big shortcuts to the common jobs. */
import Link from 'next/link';
import { requireUser } from '@/lib/session';

export default async function Home() {
  const user = await requireUser();
  return (
    <main className="page">
      <h1>Hi {user.displayName.split(' ')[0]}</h1>
      <div className="tiles">
        <Link className="tile primary" href="/log"><b>Log interaction</b><span>Conversation, podcast guest, demo or note</span></Link>
        <Link className="tile" href="/visitors"><b>Visitors</b><span>Search and open a visitor&rsquo;s timeline</span></Link>
        <Link className="tile" href="/staff-register"><b>Register visitor</b><span>For walk-ins and guests on the booth tablet</span></Link>
        <Link className="tile" href="/podcast"><b>Podcast guests</b><span>Today&rsquo;s guest list</span></Link>
        {/* plain <a>: a full page load, so the game's offline service worker takes over */}
        <a className="tile" href="/play"><b>Play Pharma Ninja</b><span>Run the game on this device. On public screens, sign in with the game account instead.</span></a>
        {user.role === 'admin' && <>
          <Link className="tile" href="/admin/export"><b>Excel export</b><span>Everything, one click</span></Link>
          <Link className="tile" href="/admin/game"><b>Game content</b><span>Pharma Ninja domains, questions, CSV</span></Link>
          <Link className="tile" href="/admin/users"><b>Team</b><span>Who can sign in</span></Link>
          <Link className="tile" href="/admin/settings"><b>Settings</b><span>Badge rule, consent text, topics, demos</span></Link>
        </>}
      </div>
    </main>
  );
}
