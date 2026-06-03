import { NextResponse } from 'next/server';
import { KIE_IMAGE_MODEL, OR_MODEL, SUPABASE_KEY, SUPABASE_URL } from '@/lib/server/env';
import { getKieConfigError, isKieConfigured } from '@/lib/server/kie-images';
import { getOpenRouterConfigError, isOpenRouterConfigured } from '@/lib/server/openrouter';

export function GET() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json(
      {
        error: 'Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) no arquivo .env',
      },
      { status: 500 },
    );
  }
  const openRouterError = getOpenRouterConfigError();
  const kieError = getKieConfigError();
  return NextResponse.json({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    openRouterOk: isOpenRouterConfigured(),
    openRouterHint: openRouterError,
    openRouterTextModel: OR_MODEL,
    kieImageOk: isKieConfigured(),
    kieImageHint: kieError,
    kieImageModel: KIE_IMAGE_MODEL,
    /** @deprecated use kieImageModel */
    openRouterImageModel: KIE_IMAGE_MODEL,
    openRouterImageModelError: kieError,
  });
}
