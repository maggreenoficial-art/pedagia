import { NextResponse } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/server/env';

export function GET() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json(
      {
        error: 'Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) no arquivo .env',
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
}
