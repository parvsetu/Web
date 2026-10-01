// Mirror of backend/src/common/legal.ts (the server stores the version each
// registrant agreed to). Keep the wording in step with the backend.

export const CONTENT_POLICY_RULE =
  'No events that violate Indian laws and regulations are allowed — e.g. serving or selling liquor/alcohol, gambling, or any other illegal activity — or activities for which the required permissions (police, municipal corporation, fire, sound/loudspeaker, etc.) have not been obtained.';

export const DECLARATION_TEXT =
  'I declare that our events comply with Indian laws and regulations and with the Parvsetu content policy — no liquor/alcohol, gambling or other illegal activity — and that we have obtained, or will obtain before the event, all required permissions (police, municipal corporation, fire, sound/loudspeaker and any other).';

export const NOT_ALLOWED = [
  'Serving, selling or distributing liquor / alcohol',
  'Gambling, betting, lotteries or games of chance for money',
  'Any activity that is illegal under Indian law (drugs, weapons, hate speech, obscenity, etc.)',
  'Events held without the required permissions — police, municipal corporation, fire safety, sound / loudspeaker, traffic and any other local authority',
];

export const PERMISSIONS_LIST = ['Police', 'Municipal corporation', 'Fire safety', 'Sound / loudspeaker', 'Traffic', 'Electricity (temporary connection)'];
