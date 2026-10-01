/**
 * Help & FAQ content for mandals (and a few for visitors). Plain data so the
 * /faq page can search it and emit FAQPage structured data. Keep answers in
 * step with the product — a wrong answer here is worse than none.
 */
export interface FaqItem {
  id: string;
  q: string;
  a: string[];
}

export interface FaqSection {
  id: string;
  title: string;
  emoji: string;
  items: FaqItem[];
}

export const FAQ: FaqSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    emoji: '🚀',
    items: [
      {
        id: 'what-is',
        q: 'What is Parvsetu and who is it for?',
        a: [
          'Parvsetu runs entry for festivals and events — Ganesh Utsav, Durga Puja, Navratri garba, melas, katha, exhibitions, carnivals and more.',
          'Your mandal issues QR passes, volunteers scan them at the gate on their phones, visitors can buy passes online, and you track donations, expenses and reports in one place.',
        ],
      },
      {
        id: 'onboard',
        q: 'How does our mandal join?',
        a: [
          'Register at Join Parvsetu → “Register my mandal / organisation” (or ask a Parvsetu field agent to register you). Choose the festivals you want to run, tick the content-policy declaration and verify your email.',
          'The Parvsetu team reviews every mandal. Once approved you become its Mandal Admin, and each festival goes live when its registration fee is paid. New mandals also get some welcome token credit.',
        ],
      },
      {
        id: 'app',
        q: 'Do we need to install an app?',
        a: [
          'No. Parvsetu works in the phone browser (Chrome / Safari). You can “Add to Home screen” to open it like an app.',
          'Scanning uses the phone camera inside the Parvsetu page, so volunteers only need a phone with internet.',
        ],
      },
      {
        id: 'cost',
        q: 'What does it cost?',
        a: [
          'Each festival pays a one-time registration fee before it goes live (the amount is shown when you register or submit it).',
          'Then you prepay “token credit”. A small commission per person admitted is taken from that credit for each pass issued; the exact rate is shown in Mandal → Credit.',
          'For paid online bookings the commission is taken from the payment itself, not from your credit.',
        ],
      },
    ],
  },
  {
    id: 'events',
    title: 'Festivals & events',
    emoji: '🪔',
    items: [
      {
        id: 'create-event',
        q: 'How do I create a festival or event?',
        a: [
          'Mandal admin → Festivals → New festival. Choose the type, dates, venue and token prefix, then add time slots (with prices) in the festival’s admin screen.',
          'A new festival is a draft: set it up, then press “Submit for review”. After the Parvsetu team approves it and the registration fee is paid it goes live (Active) automatically — only then can it be booked, issue passes or scan at the gate.',
        ],
      },
      {
        id: 'only-mine',
        q: 'Why do I only see some festival types?',
        a: [
          'Your mandal’s festival types are set when the Parvsetu team approves your registration, and only those appear when you create an event. Mandal → Settings shows the list.',
          'To add another type, contact the Parvsetu team — or create the event with “My event isn’t listed” and it is reviewed with that event.',
        ],
      },
      {
        id: 'not-festival',
        q: 'Can we use it for events that are not festivals?',
        a: ['Yes — religious gatherings, fairs and carnivals, trade and craft exhibitions, cultural shows, sports and community events are all in the list.'],
      },
      {
        id: 'venue',
        q: 'How do visitors find the venue?',
        a: [
          'In the festival settings fill “Venue & directions”: address, landmark, PIN code, a Google Maps link or map pin (tap “I’m at the venue” while standing there), entry/parking notes and a help-desk number.',
          'The address prints on every pass, and the pass page shows a map with a “Get directions” button.',
        ],
      },
      {
        id: 'slots',
        q: 'What are time slots?',
        a: ['Slots split the day (e.g. Morning 9–1, Evening 5–10). Each slot has its own price and optional capacity, and a pass is valid only for its slot window.'],
      },
    ],
  },
  {
    id: 'registration',
    title: 'Registration, review & fees',
    emoji: '📝',
    items: [
      {
        id: 'register-mandal',
        q: 'How do we register our mandal?',
        a: [
          'Go to Join Parvsetu → “Register my mandal / organisation”. Enter the organisation, contact person, the festivals you want to run (with dates and venue) and tick the declaration. We email a 6-digit code to verify your address.',
          'A Parvsetu field agent can also register you. You then get an email with a link to set your password.',
          'Already have a Parvsetu account (e.g. as a volunteer)? Log in first and register from the same page.',
        ],
      },
      {
        id: 'review',
        q: 'What happens after we register?',
        a: [
          'The Parvsetu team reviews your mandal and festivals. They may approve it, ask for changes (with a note — you edit and resubmit from “Mandal registration”), or reject it with a reason.',
          'On approval your mandal and festivals are created and you become the Mandal Admin. You can set up slots, prices, venue and volunteers straight away, but nothing is public until the festival’s fee is paid.',
        ],
      },
      {
        id: 'per-event-fee',
        q: 'Why do we pay for every festival?',
        a: [
          'The registration fee is per festival: each one is reviewed separately and goes live on its own, so one payment can’t cover several festivals.',
          'The amount depends on the festival type (some cost more than others) and is confirmed when the Parvsetu team approves the festival.',
        ],
      },
      {
        id: 'pay-fee',
        q: 'How do we pay the registration fee?',
        a: [
          'After approval you get a secure payment link by email (the team can also send it on WhatsApp). It also appears on your “Mandal registration” page and in the festival dashboard.',
          'Open it and pay — the festival goes live immediately. You can also pay the team by bank transfer or cash; they mark it paid with your reference.',
          'Links expire after 14 days; ask for a new one if yours has expired.',
        ],
      },
      {
        id: 'not-listed',
        q: 'Our event is not in the list. Can we still run it?',
        a: [
          'Yes. Choose “My event isn’t listed”, give it a name, pick the closest category and describe it. It is reviewed like any festival and is not published until approved.',
          'Good ideas may be added to the list for every mandal.',
        ],
      },
      {
        id: 'later-events',
        q: 'We are already approved. How do we add another festival?',
        a: ['Create it under Festivals → New festival, set it up, then “Submit for review” in its dashboard (tick the declaration). It follows the same review → fee → live steps.'],
      },
      {
        id: 'refund-fee',
        q: 'Can the registration fee be refunded?',
        a: ['Refunds are decided by the Parvsetu team. If no passes were issued yet the festival goes back to “fee due”; once passes exist the refund is recorded and the festival stays live.'],
      },
    ],
  },
  {
    id: 'policy',
    title: 'Content policy',
    emoji: '⚖️',
    items: [
      {
        id: 'what-not-allowed',
        q: 'What kind of events are not allowed?',
        a: [
          'No events that violate Indian laws and regulations — e.g. serving or selling liquor/alcohol, gambling, or any other illegal activity — or activities for which the required permissions (police, municipal corporation, fire, sound/loudspeaker, etc.) have not been obtained.',
          'You tick a declaration about this when registering and every time you submit a festival. See the full content policy page.',
        ],
      },
      {
        id: 'permissions',
        q: 'Which permissions do we need?',
        a: ['It depends on your city and event — usually police, municipal corporation, fire safety and sound/loudspeaker permission, sometimes traffic and electricity. Parvsetu doesn’t issue them; keep copies ready in case the team asks.'],
      },
      {
        id: 'violation',
        q: 'What happens if a festival breaks the policy?',
        a: ['The Parvsetu team rejects it, or unpublishes it at any time with a reason. An unpublished festival can’t be booked, issue passes or scan at the gate.'],
      },
    ],
  },
  {
    id: 'agents',
    title: 'Field agents',
    emoji: '🧭',
    items: [
      {
        id: 'agent-who',
        q: 'Who are Parvsetu field agents?',
        a: ['Agents work with the Parvsetu team: they visit mandals, explain the platform and can register a mandal for you. An agent can’t approve anything — the Parvsetu team still reviews every mandal and festival.'],
      },
      {
        id: 'referral-code',
        q: 'An agent gave us a referral code. Where do we enter it?',
        a: ['Use their referral link (it fills the code in for you), or type the code in “Agent referral code” on the registration form. It is optional and costs you nothing extra.'],
      },
      {
        id: 'agent-earnings',
        q: 'How do agents earn? (for agents)',
        a: [
          'You earn a fixed referral amount for each mandal you bring in — credited only when that mandal pays its first festival fee — plus, if set, a percentage of every festival fee it pays.',
          'Your dashboard shows earned, paid and due amounts and every payout. Refunded fees reverse what they earned.',
        ],
      },
    ],
  },
  {
    id: 'passes',
    title: 'Passes & QR tokens',
    emoji: '🎟️',
    items: [
      {
        id: 'issue',
        q: 'How do we issue a pass at the desk?',
        a: ['Open the festival → Issue token. Enter the visitor’s name and mobile, pick the slot and number of people, and issue. Show the QR on screen, share it, or print it.'],
      },
      {
        id: 'group',
        q: 'Can one pass cover a whole group or family?',
        a: [
          'Yes. When there are 2 or more people choose “One QR per person” (everyone enters separately) or “1 group QR” (one scan admits the whole group).',
          'The maximum people per pass is set per festival (“Max visitors per pass”).',
        ],
      },
      {
        id: 'once',
        q: 'Can a QR be used twice or copied?',
        a: [
          'No. Every QR is signed and works exactly once — even if two volunteers scan the same screenshot at the same moment, only one is allowed and the other sees “Already used”.',
          'QR codes only work inside Parvsetu’s scanner; a normal camera app just opens the pass link.',
        ],
      },
      {
        id: 'validity',
        q: 'How long is a pass valid?',
        a: ['A pass is valid for its slot window, or for the duration you choose (3, 4, 6, 24 hours…) from the options set in the festival settings. Outside that window the gate shows “Not yet valid” or “Expired”.'],
      },
      {
        id: 'print',
        q: 'Can we print passes on a thermal printer?',
        a: ['Yes. Choose the default print format per festival — A4 page, or 80 mm / 58 mm thermal receipt. Visitors and staff can also switch format before printing.'],
      },
      {
        id: 'cancel',
        q: 'A pass was issued by mistake. What do we do?',
        a: ['A Mandal admin or token-desk user with permission can cancel an unused pass from the festival’s Tokens list. A cancelled pass is refused at the gate.'],
      },
      {
        id: 'how-many',
        q: 'How many passes can we still issue?',
        a: ['The festival home and Issue token pages show “You are eligible to issue N more passes”, based on your token credit. Recharge in Mandal → Credit to issue more.'],
      },
    ],
  },
  {
    id: 'gate',
    title: 'Scanning at the gate',
    emoji: '📷',
    items: [
      {
        id: 'scan-how',
        q: 'How do volunteers scan?',
        a: ['They log in, open the festival and tap “Scan QR token”, then point the camera at the pass. A big green tick means allow entry; red shows why it was refused (used, expired, wrong festival, cancelled…).'],
      },
      {
        id: 'only-my-event',
        q: 'Can a volunteer scan passes of another festival?',
        a: ['No. Volunteers can only scan for festivals they are actively assigned to, and passes from another festival are refused.'],
      },
      {
        id: 'no-camera',
        q: 'The camera won’t open.',
        a: ['Allow camera permission for the site in the browser settings and make sure you opened the page over https. As a fallback the scanner lets you type the token code printed under the QR.'],
      },
      {
        id: 'internet',
        q: 'Does scanning need internet?',
        a: ['Yes — each scan is checked live so a pass can never be used twice at two gates. Keep mobile data on; a weak connection is fine since each scan is tiny.'],
      },
    ],
  },
  {
    id: 'team',
    title: 'Volunteers & roles',
    emoji: '🙋',
    items: [
      {
        id: 'add-volunteer',
        q: 'How do we add volunteers?',
        a: [
          'Add them from the festival’s Volunteers tab, or let them sign up themselves (Create account) and approve their application.',
          'Give each person a role for that festival; they see only what that role allows.',
        ],
      },
      {
        id: 'roles',
        q: 'What roles are there?',
        a: [
          'Mandal Admin (everything), Volunteer – Gate (scan only), Volunteer – Token desk (issue and scan), Gate Supervisor (scan plus gate logs), Treasurer (donations, expenses, accounts) and Report Viewer (read-only reports).',
          'You can also create custom roles with exactly the permissions you want.',
        ],
      },
      {
        id: 'remove',
        q: 'A volunteer left. How do we stop their access?',
        a: ['Set their assignment or membership to Inactive. They lose access to that festival on their very next action; their past scans stay in the audit log.'],
      },
      {
        id: 'audit',
        q: 'Can we see who did what?',
        a: ['Yes. Mandal → Audit log records every important action — passes issued or cancelled, roles changed, settings edited — with who and when.'],
      },
    ],
  },
  {
    id: 'online',
    title: 'Online booking & payouts',
    emoji: '💳',
    items: [
      {
        id: 'enable-booking',
        q: 'How do visitors buy passes online?',
        a: ['Turn on “Public booking” in the festival settings and set slot prices. Share your festival page link — visitors choose a day, slot and number of people, pay, and get their QR instantly.'],
      },
      {
        id: 'free',
        q: 'Can we give free passes online?',
        a: ['Yes. A slot priced ₹0 gives free passes; visitors still register so you know who is coming. Free passes use your token credit.'],
      },
      {
        id: 'money',
        q: 'How does the ticket money reach our bank?',
        a: [
          'Add your bank details in Mandal → Payouts & bank. Once verified, each payment is split automatically: the gateway fee and platform commission are deducted and the rest is settled to your account.',
          'Online paid booking needs a verified payout account.',
        ],
      },
      {
        id: 'unregistered',
        q: 'Our mandal is not registered. Can we still receive money?',
        a: ['Yes. Choose “Unregistered” and give the responsible person’s PAN and a bank account. Registered trusts/societies add their registration number, PAN, and 80G/12A if they have them.'],
      },
      {
        id: 'promote',
        q: 'How do we promote our festival?',
        a: ['Festival admin → Promote gives a public page with a WhatsApp/Facebook preview, share buttons and a ready Instagram poster to download.'],
      },
      {
        id: 'peak-pricing',
        q: 'Can we charge more on busy days (weekends, Ashtami)?',
        a: [
          'Yes. Festival admin → Time slots → Peak pricing. Add a rule for every Saturday & Sunday, or pick specific festival dates, for all slots or only some, as a fixed price or a percentage increase (e.g. +20%).',
          'If a specific-date rule and a weekend rule both match a day, the specific-date rule wins; if several rules of the same kind match, the higher price applies. The preview table shows the exact price for every day and slot.',
          'Visitors see a “Peak” badge on those days and the normal price struck through. GST is worked out on the peak price, so a ₹90 ticket raised to ₹108 moves to the 18% slab if your threshold is ₹100. Passes already paid keep the price they were bought at.',
        ],
      },
      {
        id: 'landing-page',
        q: 'Can our mandal have its own page on Parvsetu?',
        a: [
          'Yes — a landing page at /m/your-mandal (your mandal’s short name), paid yearly. Mandal admin → Landing page shows the price, lets you buy or renew for a year (renewing early adds a year to the current end date) and edit the headline, about text, up to 6 highlights, contact phone/email, Instagram/Facebook/YouTube links, WhatsApp number, theme colour, which festivals to feature and which public photos to show.',
          'The page shows your banner and logo, upcoming festivals with booking links, past festivals by year, your public photos, your mandal-wide sponsors, contact and share buttons. It is visible only while paid and switched on; use Preview to see it before that. The platform admin can also grant or switch off a page.',
        ],
      },
    ],
  },
  {
    id: 'photos',
    title: 'Logo, banner & photos',
    emoji: '📸',
    items: [
      {
        id: 'logo-banner',
        q: 'How do we add our mandal logo and banner?',
        a: [
          'Mandal admin → Settings → Logo & banner. Use a PNG, JPG or WebP photo; it is resized on your phone before upload (logo up to 512 px / 512 KB, banner up to 1920 px wide / 2 MB).',
          'The logo appears next to your mandal name on festival and booking pages, passes, donation receipts and the explore page; the banner becomes the background of your festival and explore cards.',
        ],
      },
      {
        id: 'gallery',
        q: 'Where do we keep festival photos?',
        a: [
          'Festival admin → Photos: choose several photos or take one with the camera — they are resized on the phone and uploaded with a progress bar. Add captions, open them full screen, or delete them.',
          'New photos are private (only your team sees them). Tap the globe to make a photo public: it then shows on the public festival page and can be picked for your landing page.',
          'Mandal admin → Gallery collects every festival’s photos by year so you can look back next season. Each mandal has 300 MB of photo space; the bar shows how much is used.',
        ],
      },
      {
        id: 'gallery-who',
        q: 'Who can see and upload photos?',
        a: ['Mandal Admins can upload, caption, publish and delete. Treasurers and Report Viewers can view the gallery. Gate volunteers can’t see it. Custom roles can be given “View festival photos” or “Manage festival photos”.'],
      },
    ],
  },
  {
    id: 'gst',
    title: 'GST & invoices',
    emoji: '🧾',
    items: [
      {
        id: 'gst-needed',
        q: 'Do we have to charge GST on passes?',
        a: [
          'Only if your mandal is GST-registered. Then turn on “Charge GST on online pass sales” in the festival settings and add your GSTIN in Payouts & bank.',
          'Some entry fees can be exempt (e.g. purely religious functions) — please confirm with your CA.',
        ],
      },
      {
        id: 'gst-rate',
        q: 'Which GST rate is used?',
        a: [
          'By default the slab rule: tickets up to ₹100 at 5%, above ₹100 at 18%, decided per ticket (per person). You can change the slabs or use one flat rate.',
          'Choose whether the visitor pays GST on top, or the mandal bears it inside the price.',
        ],
      },
      {
        id: 'donation-gst',
        q: 'Is GST charged on donations?',
        a: ['No. Donations carry 0% GST and the receipt says so. Only paid pass sales are taxable.'],
      },
      {
        id: 'invoice',
        q: 'Do visitors get a tax invoice?',
        a: ['Yes. Every paid online order has a numbered tax invoice (CGST/SGST split, SAC code) on the pass page. The GST report in Reports lists every invoice by month and rate, with CSV export.'],
      },
    ],
  },
  {
    id: 'money',
    title: 'Donations, expenses & reports',
    emoji: '📊',
    items: [
      {
        id: 'donation',
        q: 'How do we record a donation?',
        a: ['Festival admin → Donations → Add. A numbered receipt is created that you can share on WhatsApp or print. If you have 80G, it is mentioned on the receipt.'],
      },
      {
        id: 'donation-pass',
        q: 'Can we give passes to donors?',
        a: ['Yes. While recording a donation, tick “Give entry passes to this donor” and choose how many people — the passes are issued with the receipt.'],
      },
      {
        id: 'expenses',
        q: 'Can we track expenses and profit or loss?',
        a: ['Yes. Mandal → Accounts records expenses by category (decoration, sound, prasad…) per festival or general, and shows the yearly income, expenses and profit or loss.'],
      },
      {
        id: 'reports',
        q: 'What reports are available?',
        a: ['Visitors by day and slot, scans by gate and volunteer, passes issued, online orders, donations, GST, and the yearly account — most with search, date range and CSV download.'],
      },
    ],
  },
  {
    id: 'credit',
    title: 'Token credit & sponsors',
    emoji: '💰',
    items: [
      {
        id: 'credit-what',
        q: 'What is token credit?',
        a: ['A prepaid balance your mandal keeps with Parvsetu. Each pass issued takes a small per-person fee from it. You get warnings when it runs low, and pass issuing stops when it is used up.'],
      },
      {
        id: 'recharge',
        q: 'How do we recharge?',
        a: ['Mandal → Credit → Recharge. Pick an amount and pay; the balance updates immediately and every deduction is listed with the pass it was for.'],
      },
      {
        id: 'sponsors',
        q: 'Can we show our sponsors?',
        a: ['Yes. Mandal → Sponsors: add the sponsor’s logo, tier and message. They appear on your festival page and booking page, and you can choose to print them on passes — free of charge, no credit is used.'],
      },
      {
        id: 'promo-partners',
        q: 'Why do some passes show a brand we did not add?',
        a: ['Brands can also partner with the Parvsetu platform directly (“In association with” on the pass). The brand pays the platform per pass printed; your mandal pays nothing extra and your credit is not used. At most two such brands are printed per pass, next to your own sponsors.'],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & security',
    emoji: '🔐',
    items: [
      {
        id: 'forgot',
        q: 'I forgot my password.',
        a: ['Tap “Forgot password” on the login page and enter your email. We send a 6-digit code (valid 10 minutes) to set a new password. You can resend the code after a minute.'],
      },
      {
        id: 'login-id',
        q: 'Can I log in with my mobile number?',
        a: ['Yes — use either your mobile number or email with your password.'],
      },
      {
        id: 'data',
        q: 'Is our data safe?',
        a: ['Each mandal sees only its own data; volunteers see only their assigned festivals. Bank account and PAN numbers are stored encrypted and shown masked.'],
      },
    ],
  },
  {
    id: 'visitors',
    title: 'For visitors',
    emoji: '👪',
    items: [
      {
        id: 'lost-pass',
        q: 'I closed the page. Where is my pass?',
        a: ['Open “My passes” on the same phone, or the link you got after booking. Download the pass image or keep the link to show at the gate.'],
      },
      {
        id: 'payment-failed',
        q: 'My payment failed. Was I charged?',
        a: ['No pass is issued for a failed payment and your places are released. If money was debited, the bank normally reverses it automatically; contact the mandal with your booking details.'],
      },
    ],
  },
];

export const FAQ_CONTACT_EMAIL = 'parvsetu@gmail.com';
