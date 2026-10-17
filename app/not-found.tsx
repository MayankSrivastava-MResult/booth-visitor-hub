/* Shown for unknown pages and unknown visitor badge IDs. */
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page narrow">
      <div className="card">
        <h1>Not found</h1>
        <p className="muted">That page or visitor does not exist. Check the badge ID and try again.</p>
        <div className="row">
          <Link className="btn" href="/visitors">Search visitors</Link>
          <Link className="btn ghost" href="/">Home</Link>
        </div>
      </div>
    </main>
  );
}
