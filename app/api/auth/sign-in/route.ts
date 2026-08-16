import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

type PendingCookie = { name: string; value: string; options: CookieOptions };

const roles = new Set<Role>(['executive', 'admin', 'dm', 'ds']);

function response(
  body: object,
  status: number,
  cookies: PendingCookie[] = [],
  authHeaders: Record<string, string> = {},
) {
  const next = NextResponse.json(body, {
    status,
    headers: {
      ...authHeaders,
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
    },
  });
  cookies.forEach(({ name, value, options }) => next.cookies.set(name, value, options));
  return next;
}

export async function POST(request: NextRequest) {
  // A cross-site form must not be able to sign a visitor into somebody else's
  // account. Browsers send Origin on this JSON POST; non-browser clients may
  // omit it, so absence is allowed while a different origin is not.
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return response({ error: 'Sign-in request was refused.' }, 403);
  }

  const input = await request.json().catch(() => null);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) {
    return response({ error: 'Enter your e-mail and password.' }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response({ error: 'Live sign-in is not configured.' }, 503);
  }

  let pendingCookies: PendingCookie[] = [];
  let pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        pendingCookies = cookiesToSet;
        pendingHeaders = { ...pendingHeaders, ...headers };
      },
    },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !authData.user) {
      // Keep unknown addresses and wrong passwords indistinguishable. An
      // invitation-only church directory must not become enumerable.
      return response(
        { error: 'That email and password did not match.' },
        401,
        pendingCookies,
        pendingHeaders,
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_approved')
      .eq('id', authData.user.id)
      .single();
    if (profileError || !profile || !roles.has(profile.role as Role)) {
      return response(
        { error: 'Your account profile is not ready yet.' },
        409,
        pendingCookies,
        pendingHeaders,
      );
    }

    return response(
      {
        profile: {
          role: profile.role as Role,
          is_approved: Boolean(profile.is_approved),
        },
      },
      200,
      pendingCookies,
      pendingHeaders,
    );
  } catch {
    return response(
      { error: 'Could not reach live sign-in. Please try again.' },
      503,
      pendingCookies,
      pendingHeaders,
    );
  }
}
