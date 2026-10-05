const CHOL_HAMOED_SHABBAT = /^(.+) שבת חול המועד$/;

/**
 * A stored reading name (`lessons.parsha`) as people say it. The calendar calls the
 * Shabbat of the intermediate festival days "פסח שבת חול המועד"; this returns
 * "שבת חול המועד פסח". Weekly portions and other holiday names come back unchanged.
 * It imports no calendar code, so client components can use it.
 */
export function parshaLabel(parsha: string): string {
  const cholHamoed = parsha.match(CHOL_HAMOED_SHABBAT);
  return cholHamoed ? `שבת חול המועד ${cholHamoed[1]}` : parsha;
}
