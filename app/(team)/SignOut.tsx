'use client';
import { callApi } from '@/components/api';

export default function SignOut() {
  return (
    <button className="btn small ghost" style={{ color: '#fff', boxShadow: 'inset 0 0 0 2px #555' }}
      onClick={async () => { await callApi('/api/auth/logout', 'POST'); window.location.href = '/login'; }}>
      Sign out
    </button>
  );
}
