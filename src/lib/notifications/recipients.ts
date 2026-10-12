/**
 * One announcement reaches each person once. Push goes first; a user whose
 * push was delivered to at least one of their devices gets no email for the
 * same announcement. Anonymous push subscribers (no user id) never match a
 * recipient, and a user whose push failed (or who has no subscription)
 * still gets the email. Pure.
 */

export interface EmailRecipient {
  email: string;
  display_name: string | null;
}

/** The user ids behind delivered push subscriptions, without anonymous ones or repeats. */
export function deliveredPushUserIds(
  subscriptions: ReadonlyArray<{ id: string; user_id?: string | null }>,
  deliveredIds: readonly string[],
): string[] {
  const delivered = new Set(deliveredIds);
  const users = new Set<string>();
  for (const subscription of subscriptions) {
    if (subscription.user_id && delivered.has(subscription.id)) users.add(subscription.user_id);
  }
  return [...users];
}

const emailKey = (email: string) => email.trim().toLowerCase();

/** Recipients to email, after leaving out everyone whose push already arrived (emails compared case-insensitively). */
export function emailRecipientsAfterPush<R extends { email: string }>(
  recipients: readonly R[],
  pushedEmails: readonly string[],
): { send: R[]; skipped: number } {
  const pushed = new Set(pushedEmails.map(emailKey));
  const send = recipients.filter((recipient) => !pushed.has(emailKey(recipient.email)));
  return { send, skipped: recipients.length - send.length };
}
