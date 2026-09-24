import { redirect } from 'next/navigation';

type Props = { params: Promise<{ locale: string }> };

/** The account settings live in the personal library; old links (e.g. in emails) land there. */
export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/me#account`);
}
