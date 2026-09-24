import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/account/server';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { pushSubscriptionSchema } from '@/lib/validators';

/*
 * Web Push subscriptions for new-lesson notifications. Anyone may subscribe
 * (anonymous visitors too); signed-in subscribers are linked to their user.
 * Used by the notification bell and by public/sw-push.js when the browser
 * rotates a subscription (pushsubscriptionchange).
 */

const requestsPerIp = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });

const saveSchema = z.object({
  subscription: pushSubscriptionSchema,
  previousEndpoint: z.string().max(1000).optional(),
});
const deleteSchema = z.object({ endpoint: z.string().min(1).max(1000) });

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!requestsPerIp.consume(getClientIp(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const parsed = saveSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }

  const { subscription, previousEndpoint } = parsed.data;
  const session = await getSignedInClient();
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_id: session?.userId ?? null,
      user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.error('[push] save subscription failed:', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (previousEndpoint && previousEndpoint !== subscription.endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', previousEndpoint);
  }
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: NextRequest) {
  if (!requestsPerIp.consume(getClientIp(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  }

  const { error } = await createAdminSupabaseClient()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint);
  if (error) {
    console.error('[push] delete subscription failed:', error.message);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
