"""
Builds docs/BLUEPRINT.html: fills docs/blueprint/template.html with the data-model
section generated from backend/prisma/schema.prisma (tables grouped by domain, a
relationship diagram per group, every column). Rerun after a schema change:

    python3 docs/blueprint/build.py

A new model must be added to one of GROUPS below, or the build stops.
"""
import re, html, sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
src = (ROOT / 'backend/prisma/schema.prisma').read_text()
blocks = re.findall(r'((?:^///[^\n]*\n)*)^(model|enum) (\w+) \{\n(.*?)^\}', src, re.M | re.S)
models, enums = {}, {}
for doc, kind, name, body in blocks:
    if kind == 'enum':
        enums[name] = [l.strip().split()[0] for l in body.splitlines() if l.strip() and not l.strip().startswith('//')]
        continue
    fields, pending_doc = [], []
    for line in body.splitlines():
        t = line.strip()
        if not t: continue
        if t.startswith('///'): pending_doc.append(t[3:].strip()); continue
        if t.startswith('//') or t.startswith('@@'): pending_doc = []; continue
        parts = t.split(None, 2)
        fname, ftype = parts[0], parts[1]
        attrs = parts[2] if len(parts) > 2 else ''
        fields.append(dict(name=fname, type=ftype, attrs=attrs, doc=' '.join(pending_doc)))
        pending_doc = []
    models[name] = fields

GROUPS = [
  ('access', 'People, roles & access', 'Who can do what. A user belongs to mandals (OrganizationMember) and festivals (EventAssignment) through roles; every sensitive change lands in AuditLog in the same transaction. Phones that allow notifications are push subscriptions, linked to a user or to visitors’ passes.',
   ['User','Organization','Role','Permission','RolePermission','OrganizationMember','EventAssignment','VolunteerApplication','EmailOtp','PasswordSetupToken','PushKeys','PushSubscription','PushPassLink','AuditLog','LegalDeclaration']),
  ('festival', 'Festivals, passes & the gate', 'A festival (Event) has daily time slots and peak-day price rules. Every pass is a single-use Token with a signed QR; ScanLog records every gate attempt. A mandal’s landing page shows its photos, reviews and the Instagram photos it approved.',
   ['Event','TimeSlot','PriceRule','Visitor','Token','ScanLog','PassOrder','Sponsor','EventPhoto','StoredImage','LandingPage','LandingPurchase','InstagramConnection','InstagramMedia','VisitorReview','ReviewPhoto','ReviewReport','Achievement']),
  ('money', 'Mandal money: donations, 80G, settlements', 'Donations and expenses per festival; the 80G tax record and versioned receipts per donation; online money split into PaymentSettlement rows and paid out to the mandal’s verified account.',
   ['Donation','DonationTaxRecord','DonationDocument','Form10BDFiling','OrgTaxProfile','Expense','PayoutAccount','PaymentSettlement','Payout']),
  ('billing', 'Platform billing', 'Platform-wide defaults and each mandal’s prepaid pass credit (a hard limit enforced atomically).',
   ['PlatformSettings','OrgBilling','CreditTransaction','CreditRecharge']),
  ('registration', 'Mandal registration, fees & field agents', 'How a mandal joins: a registration reviewed by the platform, a fee per festival, and the field agent who brought it in earning from an append-only ledger.',
   ['MandalRegistration','CustomFestivalType','EventFeeRate','EventFeePayment','Agent','AgentLedgerEntry','AgentPayout']),
  ('partners', 'Brands, stall vendors & bloggers', 'Three outside account types with no mandal membership: brands pay to print on passes, vendors book stalls, bloggers earn commission on bookings they refer.',
   ['Partner','PartnerCampaign','PartnerWalletTransaction','PartnerRecharge','Vendor','StallType','StallBooking','Blogger','BloggerPromotion','ReferralLedgerEntry','BloggerPayout']),
]
grouped = {m for g in GROUPS for m in g[3]}
missing = [m for m in models if m not in grouped]
if missing:
    sys.exit(f'Add these models to a group in GROUPS: {missing}')

def rel_type(t): return t.rstrip('?[]')
def is_rel(f): return rel_type(f['type']) in models
def cardinality(f): return 'many' if f['type'].endswith('[]') else ('optional' if f['type'].endswith('?') else 'one')

out = []
for key, title, blurb, names in GROUPS:
    # ER: relations where the field holds @relation(fields: …) — the owning side.
    edges = set()
    for m in names:
        for f in models[m]:
            if is_rel(f) and '@relation(' in f['attrs'] and 'fields:' in f['attrs']:
                tgt = rel_type(f['type'])
                if tgt in names:
                    edges.add((tgt, m, f['type'].endswith('?')))
    er = ['erDiagram']
    for tgt, m, opt in sorted(edges):
        er.append(f'  {tgt} {"|o" if opt else "||"}--o{{ {m} : ""')
    connected = {a for e in edges for a in e[:2]}
    for m in names:
        if m not in connected: er.append(f'  {m} {{ }}')
    cards = []
    for m in names:
        rows = []
        for f in models[m]:
            if is_rel(f):
                continue
            t = f['type']; base = t.rstrip('?[]')
            tags = []
            a = f['attrs']
            if '@id' in a: tags.append('PK')
            if '@unique' in a: tags.append('unique')
            if t.endswith('?'): tags.append('optional')
            mdef = re.search(r'@default\(((?:[^()]|\([^()]*\))*)\)', a)
            if mdef: tags.append('default ' + mdef.group(1).replace('"', ''))
            if base in enums: tags.append('enum: ' + ' · '.join(enums[base][:8]) + (' …' if len(enums[base]) > 8 else ''))
            if '@db.' in a: tags.append(re.search(r'@db\.\w+(\([^)]*\))?', a).group(0)[4:])
            rows.append(f'<tr><td><code>{html.escape(f["name"])}</code></td><td><code>{html.escape(t)}</code></td><td>{html.escape(", ".join(tags))}{(" — " if tags and f["doc"] else "") + html.escape(f["doc"]) if f["doc"] else ""}</td></tr>')
        rels = [f'{f["name"]} → {rel_type(f["type"])}{"[]" if f["type"].endswith("[]") else ""}' for f in models[m] if is_rel(f)]
        tbl = re.search(rf'model {m} \{{.*?@@map\("([^"]+)"\)', src, re.S)
        table = tbl.group(1) if tbl else m
        cards.append(f'''<details class="model" id="m-{m}"><summary><span class="mname">{m}</span><span class="mtable">{table}</span><span class="mcount">{len(rows)} columns</span></summary>
<div class="tablewrap"><table><thead><tr><th>Column</th><th>Type</th><th>Notes</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
{('<p class="rels">Relations: ' + html.escape(' · '.join(rels)) + '</p>') if rels else ''}</details>''')
    out.append(f'''<section class="domain" id="d-{key}"><h3>{html.escape(title)} <span class="count">{len(names)} tables</span></h3><p>{html.escape(blurb)}</p>
<div class="diagram"><pre class="mermaid">{html.escape(chr(10).join(er))}</pre></div>
<div class="models">{"".join(cards)}</div></section>''')
page = (HERE / 'template.html').read_text()
page = page.replace('<!-- SCHEMA -->', '\n'.join(out)).replace('{{MODELS}}', str(len(models))).replace('{{ENUMS}}', str(len(enums)))
page = page.replace('{{DATE}}', date.today().strftime('%-d %B %Y'))
(ROOT / 'docs/BLUEPRINT.html').write_text(page)
print(f'docs/BLUEPRINT.html: {len(models)} models, {len(enums)} enums')
