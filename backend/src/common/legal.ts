// The content policy every mandal registration and every event submission must
// accept. Bump DECLARATION_VERSION whenever the wording changes — the version
// stored on each LegalDeclaration row says exactly what was agreed to.

export const DECLARATION_VERSION = '2026-10-01';

export const CONTENT_POLICY_RULE =
  'No events that violate Indian laws and regulations are allowed — e.g. serving or selling liquor/alcohol, gambling, or any other illegal activity — or activities for which the required permissions (police, municipal corporation, fire, sound/loudspeaker, etc.) have not been obtained.';

export const DECLARATION_TEXT =
  'I declare that our events comply with Indian laws and regulations and with the Parvsetu content policy — no liquor/alcohol, gambling or other illegal activity — and that we have obtained, or will obtain before the event, all required permissions (police, municipal corporation, fire, sound/loudspeaker and any other).';

export const CONTENT_POLICY = {
  version: DECLARATION_VERSION,
  rule: CONTENT_POLICY_RULE,
  declaration: DECLARATION_TEXT,
  notAllowed: [
    'Serving, selling or distributing liquor / alcohol',
    'Gambling, betting, lotteries or games of chance for money',
    'Any activity that is illegal under Indian law (drugs, weapons, hate speech, obscenity, etc.)',
    'Events held without the required permissions — police, municipal corporation, fire safety, sound / loudspeaker, traffic and any other local authority',
  ],
  consequences: [
    'The platform reviews every event before it is published.',
    'An event that breaks these rules is rejected, or unpublished at any time with a reason.',
    'Passes and bookings stop working for an unpublished event.',
  ],
};
