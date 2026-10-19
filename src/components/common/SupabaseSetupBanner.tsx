import { useState } from 'react';
import { AlertCircle, Copy, Check, ExternalLink, X } from 'lucide-react';

export default function SupabaseSetupBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

  const envSnippet = `VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`;

  const copySnippet = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #312e81 0%, #1e1b4b 100%)',
        borderBottom: '1px solid rgba(99,102,241,0.4)',
        color: '#e0e7ff',
        padding: '12px 20px',
        fontSize: 13,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={16} color="#a5b4fc" />
          </div>
          <div>
            <strong style={{ color: '#ffffff' }}>Supabase Configuration Needed:</strong> Create a <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>.env.local</code> file with your Supabase credentials to connect the live database.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={copySnippet}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#ffffff', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            }}
          >
            {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
            {copied ? 'Copied template!' : 'Copy .env template'}
          </button>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: '#c7d2fe', textDecoration: 'none', fontSize: 12, padding: '5px 8px',
            }}
          >
            Supabase Dashboard <ExternalLink size={12} />
          </a>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
            aria-label="Dismiss banner"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
