# End-to-end smoke test

The MVP's critical path is:

1. Super admin signs in → creates a pilot company + bootstrap admin.
2. Pilot admin signs in → creates a non-admin user.
3. Non-admin signs in → creates an invoice.
4. Admin marks the invoice as paid → downloads it as PDF.

Until a CI-grade Playwright suite is in place, this is a **manual** smoke test against the Firebase Emulator Suite, runnable in ~5 minutes.

## Prerequisites

- All workspace deps installed: `npm install`, `npm --prefix functions install`, `npm --prefix firestore-rules-tests install`.
- Java 21+ on PATH (Firestore emulator JVM).
- Run the bootstrap script (see [bootstrap-super-admin.md](bootstrap-super-admin.md)) against the emulator to create a super admin. In emulator mode, you can use a known fixed password by going through the Auth Emulator UI directly.

## Run

```bash
# Terminal 1 — start everything
npm start
```

This starts the Angular dev server (`http://localhost:4200`) and the emulator suite. The Emulator UI is at `http://localhost:4000`.

## Manual steps

In a browser:

1. **Bootstrap super admin** (one-time): go to the Auth Emulator UI at `http://localhost:4000/auth`, add a user with email `super@local.test` and any password. Then set their custom claim (via the bootstrap script or the Admin SDK directly) to `{ "role": "super-admin" }`.

2. **Super admin path**:
   - Visit `http://localhost:4200/super-admin/login`, sign in as `super@local.test`.
   - Expand "Create company". Create company `acme-co`, name `Acme Co.`, default currency `USD`, admin `alice@local.test`, "Alice".
   - Note the password-reset link shown. Open it in a new tab (it points at the Auth Emulator) and set Alice's password to anything you'll remember.

3. **Company admin path**:
   - Visit `http://localhost:4200/login`. Step 1: enter company code `acme-co`. Step 2: sign in as `alice@local.test`.
   - You land on `/app/dashboard` — it's empty.
   - Go to **Customers** → create a customer "Globex" with email `billing@globex.test`.
   - **India GST customer (added by `india-gst-invoicing`)**: also create a customer "Globex Traders" with phone `+91 9876543210`, shop name `Globex Mart`, full address `12 MG Road, Bengaluru 560001`, GSTIN `29ABCDE1234F1Z5`. Save — verify form blocks if you mistype the GSTIN.
   - Go to **Products** → create a product "Consulting hour", unit price `150`, currency `USD`.
   - **India GST product**: also create a product "Cotton T-shirt", unit price `499`, currency `INR`, HSN/SAC `6109`.
   - Go to **Users** → create user `bob@local.test`, "Bob". Copy the reset link, set Bob's password.

3a. **Configure invoice profile (added by `invoice-branding`)**:
   - Still signed in as Alice, click **Profile** in the side nav.
   - **Header info**: phone `+91 9876543210`, email `sales@acme.example`, website `acme.example`, GSTIN `29ABCDE1234F1Z5`, PAN `ABCDE1234F`. Add two address lines: `12 MG Road` and `Bengaluru 560001`.
   - **Footer / Payment info**: bank account name `Acme Pvt. Ltd.`, bank `HDFC Bank`, account number `50100123456789`, IFSC `HDFC0000123`, branch `MG Road`, UPI `acme@hdfcbank`.
   - **Signature & Disclaimer**: signatory name `Alice Smith`, title `Director`. Terms & Conditions: `Payment due within 14 days.\nLate fee 1% per week.`. Disclaimer: `Subject to Bengaluru jurisdiction. Goods once sold cannot be returned.`
   - Type a deliberately bad GSTIN (e.g. `123`) and Tab away — verify an inline red error appears and **Save** disables. Fix it back to a valid 15-char GSTIN before saving.
   - Click **Save**. Confirm the "Saved." indicator appears and the form goes pristine.
   - Click **Revert** — confirm the form re-loads the saved values (no diff).

4. **Non-admin path**:
   - Sign out. Sign in as `bob@local.test` (still through `acme-co`).
   - You land on `/app/invoices`. Click "New invoice" — Globex is in the dropdown, "Consulting hour" is in the product picker. Create an invoice with 2 hours.
   - Verify the new invoice appears in the list.

5. **Back to admin path**:
   - Sign out, sign in as Alice.
   - Open the invoice Bob just created → "Mark as Paid" → "Download PDF".
   - Verify the PDF downloads, shows `acme-co`'s name, the customer, the line items, and `PAID` status.
   - **(added by `invoice-branding`)** Verify the PDF now ALSO renders, inside BOTH copies: the configured phone / email / website / address / GSTIN-PAN line below the company name; the **Bank Details** block (account name, bank, account number, IFSC, branch, UPI) and **Terms & Conditions** block below the totals; a `For <Company Name>` signature block in the lower-right with `Alice Smith` and `Director` under a wet-signature gap; and the configured disclaimer in small italic at the very bottom.
   - **Cache-invalidation check (added by `invoice-branding`)**: re-download the SAME invoice immediately after editing one field on the Profile page (e.g. change the phone number), and verify the new value appears in the PDF without a page reload. Edit a field again and re-download — change still propagates. This proves the `CompanyProfileService.invalidate()` path works.

5a. **India GST invoice path** (added by `india-gst-invoicing`):
   - Still signed in as Alice, click **New invoice**.
   - Pick customer **Globex Traders** — verify the "Bill to" card appears with shop name, full address, GSTIN, phone.
   - Pick product **Cotton T-shirt** on a line — verify description, HSN/SAC `6109`, and unit price auto-populate. Set quantity to 2 (line total ₹998).
   - In the **Tax & Charges** section: enter GST % `18`. Verify CGST 9% and SGST 9% display live. Enter Other Charges `50` and Round Off `-0.64` (to round to a whole rupee).
   - Verify the **Grand Total** panel reads ₹1227 and the **Amount in words** shows "Rupees One Thousand Two Hundred Twenty Seven Only.".
   - Save. On the detail page, confirm the totals card shows Subtotal / CGST / SGST / Other Charges / Round Off / Grand Total and the amount in words.
   - Click **Download PDF**. Open the PDF and verify: the Bill-to block has shop name + full address + GSTIN + phone; the line items table includes the HSN/SAC column with `6109`; the totals block shows CGST 9% / SGST 9% / Other Charges / Round Off / Grand Total; the "Amount in words" footer appears.
   - **Layout (current: `pdf-portrait-side-by-side`)**: confirm the PDF is **portrait** A4 with two identical copies of the invoice on a single page — **left copy and right copy** — separated by a **vertical dashed line down the centre of the page**. Body text is 8pt; all amounts/dates/numbers match the on-screen detail view exactly. The PDF must be a single page (no overflow onto a second page). Inside each copy, the Bill-to fields and the invoice date / due date / status render as a single vertical stack (not two side-by-side sub-columns).
   - Go back to the older invoice from step 4 (legacy, no GST) — confirm its detail page still shows a single Subtotal/Total line, and its PDF also uses the new portrait side-by-side layout (two copies, vertical dashed cut line) but with the legacy Subtotal/Total block (no CGST/SGST/Amount-in-words) inside each copy.

6. **Tenant isolation check** (optional):
   - Super admin creates a second company `other-co` with admin `eve@local.test`.
   - Sign in as Eve. Verify no Acme Co. data is visible anywhere.
   - In DevTools, try to read `/companies/acme-co/customers` directly with the Firestore SDK — Security Rules should deny.

## Future: Playwright automation

When ready to automate, add `@playwright/test` as a devDep and convert each numbered step above into a spec. Use `firebase emulators:exec` to wrap the test command so the emulator suite spins up and tears down per CI run:

```bash
firebase emulators:exec --only auth,firestore,functions \
  "npx playwright test"
```

Reset-link emails (which the real Firebase sends) will be available in the Auth Emulator UI's "Send emails" tab; Playwright can poll the emulator's REST API for them.
