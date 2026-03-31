'use client';

import { useState, useEffect } from 'react';
import { supabase, signInWithGoogle, signOut } from '../lib/supabase';
import Planner from './planner';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ color: '#999' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 500, marginBottom: 8 }}>Weekly Planner</div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>Sign in to access your planner</div>
          <button onClick={signInWithGoogle} style={{
            padding: '10px 24px', fontSize: 14, fontWeight: 500,
            background: '#1a1a1a', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer',
          }}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem 1.5rem 3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button onClick={signOut} style={{
          fontSize: 11, padding: '3px 10px', color: '#999', border: '1px solid #d4d3d0',
          borderRadius: 6, background: 'transparent', cursor: 'pointer',
        }}>
          Sign out
        </button>
      </div>
      <Planner />
    </main>
  );
}
