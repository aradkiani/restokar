# Restokar (رستوکار) — Feature Reference

Restokar is a Persian-first, mobile-first SaaS for restaurants, cafés and
chains. It replaces the paper menu with a digital menu that guests order from at
the table, sends those orders live to the kitchen, and turns every order into
sales, profit, stock and customer data for the owner — in one panel, with no app
to install and no special hardware.

This document lists every feature found in the codebase, what it does and how it
works. It is written for marketing, so it describes behaviour rather than code;
a short section at the end lists the features that are built but switched off,
so nothing is promised that a customer cannot use today.

**Who uses it**

| Who               | What they see                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Guests            | The public menu on their phone: browse, order, pay, follow the order, call a waiter, rate the meal     |
| Restaurant owners | The full dashboard: menu, design, orders, reports, finance, stock, customers, staff, branches, billing |
| Staff             | Only the dashboard sections the owner grants them (e.g. the order board)                               |
| Branch managers   | Their own branch's orders, till, tables, stock, reports and expenses                                   |
| Platform team     | An admin console to run the whole service                                                              |

---

## 1. The guest's digital menu

### 1.1 Digital menu with a shareable link

Every venue gets a public menu at its own address (`/menu/<name>`), usable as an
Instagram bio link, on Google Maps, or behind a QR code. The menu shows the
venue's logo, cover photo, name, tagline, categories and dishes with prices. It
updates the moment the owner changes anything — no reprinting. The owner can
hide prices, unpublish the menu, or switch online ordering off and use it as a
menu only.

### 1.2 Eleven ready-made menu templates

Owners pick one of 11 professionally designed templates, each aimed at a kind of
venue:

| Template        | Style                                                       |
| --------------- | ----------------------------------------------------------- |
| اورورا (Aurora) | Bright, modern, glassy — contemporary cafés                 |
| نوآر (Noir)     | Dark, luxurious, minimal — fine dining                      |
| امبر (Ember)    | Warm, energetic, big cards — burgers and fast food          |
| کتان (Linen)    | Calm, classic, typographic list — traditional restaurants   |
| بازار (Bazaar)  | Market-style, colourful                                     |
| اطلس (Atlas)    | Precise high-contrast grid — modern cafés and bistros       |
| ریل (Reel)      | A horizontal photo rail per category — photo-led menus      |
| شکوفه (Bloom)   | Round medallions and capsules — ice cream, juice, sweets    |
| کاشی (Kashi)    | Persian tilework, arches and eight-point stars — tea houses |
| ترنج (Qalam)    | Persian calligraphic look                                   |
| ویترین (Vitrin) | Display-case layout                                         |

Templates are maintained centrally: when the platform improves a template, every
menu using it gets the improvement automatically, while the owner's own colours
and settings are kept.

### 1.3 Bilingual menu (Persian / English)

Every name, description, category, option and info section can have an English
version. Guests switch language with one tap; the venue chooses the default
language. A translation-status check shows the owner how much of the menu is
actually translated, so English-speaking guests never see a half-English menu
without the owner knowing.

### 1.4 Search, category navigation and dietary filters

Guests can search the menu, jump between categories with a sticky category bar
that follows their scroll, and filter by dietary tags. Six fixed tags — spicy,
vegetarian, vegan, gluten-free, contains nuts, contains dairy — appear as small
icons on dish cards and as labelled chips in the dish detail, and the filter only
offers tags that the menu actually uses.

### 1.5 Dish detail sheet

Tapping a dish opens a bottom sheet with a large photo, the full description,
preparation time, and up to three owner-written information sections (for
example ingredients, chef's note, calories). Owners of menus without photos can
switch the photo off so the sheet stays clean.

### 1.6 Options and add-ons

Dishes can have option groups — required (e.g. "choose the meat", "size") or
optional (e.g. extra cheese, sauces) — with a maximum number of choices and a
price difference per choice. A dish with a required choice cannot be added
without making it; the price updates as choices are made, and the server
recalculates every price itself, so a guest can never change what they pay.

### 1.7 Built-in upselling at the moment of ordering

Several surfaces raise the average bill without a waiter:

- **"Anything with that?"** — the moment a dish goes into the basket, a sheet
  offers what usually goes with it.
- **"Complete your order"** — suggestions inside the cart.
- **"These go well with it"** — pairings inside the dish sheet.
- **Size upgrade prompt** — a one-tap "make it large + X Toman" offer, built from
  the dish's own size options.
- **Meal deals (bundles)** — "order it for less": combos such as burger + fries +
  drink shown with their saving and contents.
- **Featured dishes** — a featured strip at the top of the menu and badges on
  cards ("chef's choice", "popular", "new", "today's special", "limited time", or
  a custom label), optionally only between two dates.

Suggestions come from three sources, merged by one rule: the owner's own
pairings, meal deals containing the dish, and what the venue's own order history
shows is ordered together.

### 1.8 Ordering from the table by QR code

Each table has its own QR code with the table number built in. A guest scans,
orders, and the order arrives on the kitchen board already attached to that
table — no app, no account, no waiter needed to take it. Guests can order in
several rounds; each round is its own order on the same table.

### 1.9 Takeaway with a pickup number

If the venue enables takeaway, guests ordering without a table are asked "eat
in or take away?". A takeaway order gets a pickup number shown to the guest and
on the board, and is collected at the counter.

### 1.10 Checkout

A two-step checkout designed for one hand on a phone:

- name (to call the order), table number, and an order note or per-dish notes;
- phone number (optional, if the venue collects them) with a separate,
  recorded choice to receive promotional messages;
- discount code, checked live;
- optional tip, with the venue's suggested percentages;
- a breakdown with tax, service charge and rounding as the venue configured;
- a minimum order amount if the venue set one;
- pay on site, or pay online through the bank gateway (when enabled — see §14).

The checkout is protected against double-submission: tapping twice, or retrying
after a dropped connection, never creates two orders.

### 1.11 Live order tracking

After ordering, the guest sees a tracking page that updates live as the kitchen
moves the order: received → preparing → ready → delivered (or cancelled), plus
the pickup number for takeaway.

### 1.12 Call a waiter / request the bill

From the menu a guest can call a waiter or ask for the bill (with an optional
note). The request appears instantly on the staff board, and the table's
"wants the bill" status shows on the tables view. The button's label can be
customised by the venue.

### 1.13 Ratings and reviews

After an order is delivered, the guest is invited to rate it (1–5 stars) with an
optional comment. Reviews appear in the owner's dashboard, filterable by rating.

### 1.14 Availability that runs itself

- **Opening hours per category or dish** — e.g. breakfast only from 7:00 to
  11:00. Outside its window a dish shows as unavailable and cannot be ordered.
- **Sold out today** — the kitchen can switch a dish off from the order board; it
  comes back automatically at the start of the next business day.
- **Unavailable / hidden** — the owner can mark a dish unavailable, or hide it
  from the menu entirely until it is back.
- **Souvenir / gift section** — a category named as a souvenir section is
  presented as a retail shelf (for packaged goods such as gaz or saffron).

### 1.15 Venue information and social links

The menu footer shows the venue's phone numbers and up to three social buttons
(Instagram, Telegram, WhatsApp or a website). The venue's address,
tagline and "about us" text appear in the menu.

### 1.16 Paused, not missing

If a venue's subscription lapses, the menu does not disappear: guests who scan a
printed QR code see a polite "this menu is temporarily unavailable" page with the
venue's name.

### 1.17 Fast on weak mobile connections

Photos are shrunk in the owner's browser before upload, menus are cached and
served quickly, and every menu is tested at phone width. The whole menu is
right-to-left, uses Persian digits, and works in any phone browser.

---

## 2. Getting started and running the menu (owner dashboard)

### 2.1 Sign-up, sign-in and accounts

- **Sign-up** (when public registration is on): name, mobile number, a password,
  the venue's name and its menu address; the number is confirmed once with an SMS
  code. A trial period starts automatically (length set by the platform team).
- **Sign-in** with mobile number and password — no SMS at every login.
- **Forgot password**: a new password set after one SMS code; staff and branch
  managers can also get a new password from the owner, and owners from the
  platform team.
- **Activation**: accounts created by someone else (staff, branch managers,
  admin-created owners) activate themselves once with an SMS code, or use a first
  password handed over by the owner.
- **My account**: change password (signs the account out of every other device)
  and change mobile number (confirmed by a code sent to the new number).

### 2.2 "First steps" checklist

A new venue's dashboard shows five short steps — complete venue details, enter
the menu with prices, choose a design, create tables and print QR codes, place a
test order — each ticked automatically from what the venue has actually done.

### 2.3 Dashboard overview

The home screen answers "how is today going?": today's sales, orders, open
orders and average order, each compared with the same day last week; pending
guest requests; the busiest hours over the past four weeks; recent orders; top
dishes; and a **menu health** panel listing dishes without a cost, photo or short
description, and unavailable dishes. Quick links lead to common tasks.

### 2.4 Menu builder

- Categories with a name (and English name), an icon from a built-in set or a
  custom icon image, an optional category image, ordering, and opening hours.
- Dishes with name, short and full description (both languages), photo, price,
  "price before discount" (shown struck through), cost, preparation time,
  dietary tags, featured status and label, availability, hide-when-unavailable,
  pairing note, information sections, option groups, and opening hours.
- Live **profit per unit** and **margin** shown while editing a dish's price and
  cost.
- Drag-free reordering with move up / move down.
- Plan limits on the number of dishes and categories are enforced where a plan
  sets them.

### 2.5 Meal deals (bundles)

An owner builds a combo from existing dishes. The deal is an ordinary dish on
the menu with its own price; the menu shows guests what it contains and how much
they save compared with ordering the items separately.

### 2.6 Suggestions ("goes well with")

For each dish the owner chooses which other dishes to suggest, in order. These
drive the upsell surfaces in §1.7.

### 2.7 "Ordered together" insights

Restokar counts which dishes share a bill in the venue's own order history (the
last 180 days, refreshed daily) and shows the strongest pairs — with how often
they appear together — so the owner can turn any of them into a suggestion with
one click.

### 2.8 Menu design editor

- Choose any of the 11 templates.
- One-click colour palettes, all checked for readable contrast.
- Fine control over primary, secondary, background, card and text colours; a
  background image with adjustable overlay.
- Four Persian fonts: Vazirmatn, Estedad, Sahel, Samim.
- Corner roundness and visual style: flat, glass, or elevated.
- Switch dish photos on or off in the detail sheet.
- **Live preview** at phone, tablet and laptop width, and a one-click reset to
  the template's defaults.

### 2.9 Table QR codes

Create tables with a number, an optional label (e.g. "terrace", "second floor")
and seat count. Each table gets its own QR code; there is also a general QR code
without a table for shop windows and social media. Codes download as PNG or SVG,
or print all together on a ready-to-cut sheet. The number of tables follows the
venue's plan.

### 2.10 Venue settings

Name (Persian and English), tagline, "about us", logo, cover photo, two phone
numbers, address, social links (up to three), menu address, online ordering
on/off, online payment on/off, show prices, publish menu, default menu language,
takeaway, collecting guest phone numbers, the waiter-call button and its label,
and the bilingual menu.

### 2.11 Pricing and payment options

- VAT on/off with a percentage.
- Service charge on/off with a percentage.
- Tips on/off with suggested percentages.
- Rounding the final amount to a chosen step (up, down or nearest).
- Minimum order amount.
- A live **invoice preview** showing the effect of these settings on a sample
  basket.

### 2.12 Discount codes

Percentage or fixed-amount codes, with an optional cap (e.g. 15% off, at most
150,000 Toman), switched on or off individually. Guests enter them at checkout;
the venue chooses whether the discount amount is shown on the placed order.

### 2.13 Business day (for venues open past midnight)

Each venue — and each branch — sets its own working hours, e.g. 17:00–03:00. An
order placed at 01:30 then counts toward the same night, not the next calendar
day, in every report, in the till close and in stock. Changing the hours never
moves past records: each order keeps the business day it was placed in. A plain
explanation of when the day changes is shown as the owner types.

---

## 3. Orders and service

### 3.1 Live order board (kitchen display)

Orders appear the instant they are placed, in four columns: new, preparing,
ready, delivered. Staff move each order forward with one tap (only forward, one
step at a time, so the screen and the server always agree). Each card shows the
order number, table or takeaway badge, guest name, items with their options and
notes, total, paid/unpaid status, and how long it has been waiting — the card
turns amber after 12 minutes and red when late, so the pass sees a slow ticket
before the guest complains. Other features:

- live connection indicator and a notification sound for new orders;
- one-tap "paid in cash", and an order that is awaiting online payment is marked
  as such;
- cancel an order (with confirmation);
- **auto-print** of a kitchen ticket for every new order;
- finished orders leave the board on their own an hour after they are delivered
  and paid, so the board stays a to-do list;
- works on a phone, a tablet or a kitchen screen, and updates across all of them
  at once.

### 3.2 Tables view and one-bill settlement

A second tab shows every table with unpaid orders from the last 12 hours,
gathered into one tab per table, and which tables have asked for the bill. The
cashier prints one combined bill (identical dishes merged into one line) and
settles all of a table's rounds in cash with one action.

### 3.3 Guest requests

Waiter calls and bill requests appear on the board as they arrive and are
acknowledged by staff.

### 3.4 Sold out from the board

Kitchen staff can mark a dish "sold out today" without menu-editing rights; it is
removed from the menu until the next business day (for a chain, only at that
branch) and can be brought back with one tap.

### 3.5 Counter (manual) orders

Staff type in orders taken at the counter or by phone, for a table or takeaway,
from the same menu and prices. They go through the same board, stock and reports
as guest orders.

### 3.6 Order details

Every order opens to its full record: items and options, notes, totals with
discount, service, tax, rounding and tip, a timeline (placed, preparing, ready,
delivered, paid, cancelled, refunded), payment transactions with tracking codes,
and a link to the guest's customer record.

### 3.7 Refund queue

An order cancelled after it was paid stays on a "refund due" list until staff
confirm the money was given back — no earlier than one hour after the
cancellation, so a refund is not cleared in the same rush as the cancel.

### 3.8 Printing

Print a guest bill, a kitchen ticket (without prices), a combined table bill,
the end-of-day till report, and subscription receipts — all formatted for small
receipt printers or A4.

### 3.9 Till close (end of day)

For any business day, the till close shows orders, total sales, cash taken,
online payments, unpaid orders, cancellations, refunds due, discounts, tips, tax
and service charge. The cashier enters the opening float and the counted cash;
Restokar shows what the drawer should hold, the shortage or surplus, and stores
the close with who closed it and a note. Past closes are listed with their
differences, and each can be reprinted. Unpaid orders are flagged before closing.

---

## 4. Pricing intelligence and costing

### 4.1 Ingredient costs and recipes

Each ingredient has a unit (grams, kilograms, millilitres, litres, teaspoon,
tablespoon, pieces or dozen) and a purchase price
quoted in whatever unit the invoice uses (e.g. "45,000 Toman per kilo" for an
ingredient used in grams). Each dish's recipe states how much of each ingredient
one portion uses; when a recipe is fully priced, the dish's cost is calculated
from it automatically.

### 4.2 Automatic price updates when ingredient costs change

When the purchase price of an ingredient changes, every dish that uses it moves
by exactly the change in its own ingredient cost (in Toman, so the owner's margin
in Toman is protected). The owner sees which dishes moved and from what to what.
The feature can be switched off; recipe edits change cost but never price.

### 4.3 Exact price, clean menu price

Restokar keeps each dish's exact price internally and shows guests a rounded
price at a step the owner chooses (e.g. to the nearest 5,000 Toman). Repeated
increases are applied to the exact price, so rounding never compounds.

### 4.4 Price health warnings

Dishes selling below their ingredient cost, or under the owner's chosen margin
floor (default 30%), are flagged in the menu and on the dashboard. Warnings never
block a change — the decision stays with the owner.

### 4.5 Bulk price change with preview

Raise (or lower) every price on the menu by one percentage. Before anything is
saved the owner sees the real dishes with their old and new prices, how many
prices will change, and how many dishes would end up below cost or under the
margin floor. Only then is the change applied, in one step, and recorded in the
activity log.

---

## 5. Reports and analytics

### 5.1 Sales report

Revenue, number of orders, average order value and gross profit for the last 7,
30 or 90 days, with the change against the previous period; a daily sales trend
chart; best-selling dishes; each category's share; and busiest hours. Every
figure counts by business day and excludes cancelled orders; revenue excludes
tax and tips, which do not belong to the venue.

### 5.2 Automatic "what changed and why" insights

For today, yesterday, this week, this month, or the last 7/30/90 full days,
Restokar compares with the previous period and writes short, plain-language
findings: revenue up or down and by how much; whether that came from more
orders or bigger baskets; which dishes and categories pulled it up or down;
changes in returning-customer orders; a best-seller that earns little; a
high-margin dish that sells little (with a suggestion to feature it or add it to
suggestions); concentration of revenue in a few dishes; featured dishes or
suggestions that are seen but rarely ordered; and table activity. Every finding
shows the numbers behind it, and weak data is marked as such.

### 5.3 Per-dish profit (menu engineering)

For every dish: quantity sold, revenue, gross profit and real margin — computed
from what each dish actually sold for and cost on the day, not from today's list
price. Each dish is placed on the classic volume/margin grid and labelled
**پرفروش و پرسود** (sells well, earns well), **بازبینی قیمت** (sells well, earns
little — worth a price review), **فرصت معرفی** (earns well, sells little — worth
promoting), or normal, against the menu's typical margin. Dishes without a cost
or with too few sales are labelled so, rather than hidden.

### 5.4 Kitchen speed

How long orders take from placed to ready: the typical time, the time 9 in 10
orders are ready within, the share ready within the target, a breakdown by hour
of day, and dine-in versus takeaway.

### 5.5 Table performance

For each table: orders, sales, average order, menu visits from that table's QR
code, orders per visit, change against the previous period, activity level
(high / medium / low), and last order — plus the busiest table and tables whose
menu is opened often but rarely ordered from.

### 5.6 Merchandising performance

For featured dishes and for each suggestion: how many guests saw it, opened it,
added it to the basket, how many orders included it, and the sales it brought.

### 5.7 Menu views

Every opening of a venue's menu is counted per day and per table, shown on the
subscription page and used in the table report.

### 5.8 Excel export

Real right-to-left Excel workbooks (with CSV as an alternative) for: daily sales,
orders, order items, dish performance, categories, customers, stock, stock
purchases, profit and loss, and table performance — for any date range. Exports
use the same figures as the screens.

---

## 6. Finance

### 6.1 Profit and loss

For 30 days, 90 days or a year: revenue, cost of goods sold, gross profit,
operating expenses, stock waste, stock shortages and surpluses found at counts,
net profit, net margin, and food-cost percentage — with expenses broken down by
category. A loss is shown as a loss, not hidden as zero.

### 6.2 Expenses

Record rent, salaries, utilities, supplies, marketing and other costs with a
title, amount, date, note and a recurring flag. Expenses feed the profit and
loss and the financial report.

### 6.3 Dish profitability table

Each dish's current price, cost, unit profit, margin and units sold, with the
real profit earned in the period.

### 6.4 Printable financial report

A professional report the owner can print or save as PDF — monthly, quarterly or
any custom range — with a cover page, financial summary, sales, dish sales,
categories, expenses, profit and loss, period-by-period analysis, revenue and
profit charts, and a management summary (best and worst day, best dish, biggest
expense). It is built from the same functions as the screens, so the report and
the dashboard always agree.

---

## 7. Inventory and stock

### 7.1 Ingredient catalogue and recipes

The owner defines ingredients with unit, purchase price, low-stock warning
level, group and default supplier, and the recipe of each dish (see §4.1).

### 7.2 Automatic stock deduction

Every order takes its recipe ingredients off the shelf of the site that served
it, the moment it is placed; a cancelled order puts exactly what it took back.
For a chain, each branch has its own shelves while the catalogue and recipes are
shared.

### 7.3 Purchases from suppliers

Record a purchase invoice with date, supplier, invoice number and lines
(ingredient, quantity in any unit, line total), paid or on credit. Stock rises
by the bought amount, the ingredient's average cost is recalculated, and the
owner can choose to update the reference prices — which can trigger the
automatic repricing in §4.2. Unpaid invoices are tracked until marked paid.

### 7.4 Waste

Record waste with a reason — spoiled, expired, damaged, staff meal, other —
valued at the ingredient's average cost and reported in the profit and loss.

### 7.5 Stocktake

Enter what was physically counted; Restokar shows expected versus counted, the
shortage or surplus per item and in Toman, and sets the shelf to the counted
figure. Differences reach the profit and loss.

### 7.6 Stock history

A full movement history per item and site: opening stock, purchases, orders,
cancellations, waste, counts and manual adjustments, each with who did it and
when.

### 7.7 Stock overview

Current quantity and value of each item, total stock value, items running low,
items below zero, and the amount owed to suppliers.

### 7.8 Suppliers

A supplier list with phone and notes, active or archived.

---

## 8. Customers and marketing

### 8.1 Customer book built from orders

Every order with a phone number builds the venue's customer book automatically —
no separate system to fill in. Numbers are normalised (e.g. +98, 0098, Persian
digits) so one guest is one customer; for a chain, the book is shared across
branches.

### 8.2 Segments, value and win-back opportunities

Each customer shows orders, total spend, average order, first and last order,
and their usual ordering rhythm. Customers are grouped as **new**, **returning**,
**loyal**, **at risk** (later than their usual rhythm) and **inactive**, and as
standard or **high-value**. The page shows the repeat rate, average customer
value and orders per customer, plus ready-made opportunities: first-time guests
who never came back, high-value customers who are overdue, long-lost regulars,
and active loyal customers — each with the spend at stake. Customers can be
searched, filtered and exported to Excel.

### 8.3 Marketing consent

Guests decide at checkout whether they agree to receive messages; the choice and
its date are recorded on the customer.

### 8.4 Campaign planning

Plan a campaign for a customer segment, optionally tied to a dish or category,
with start and end dates and a status (draft, scheduled, active, paused,
completed, cancelled), and see how many customers it reaches. Campaigns are a
planning tool; they do not send messages on their own.

### 8.5 Promotional SMS

The owner writes a message, chooses the audience (all consenting customers or
one segment), sees the length, number of SMS parts and the cost, and pays. Only
customers who consented are included. The request goes to the Restokar team,
who send it and update its status. (Paying for broadcasts is switched off until
the payment gateway is connected — see §14.)

### 8.6 Reviews

All guest ratings and comments in one place, filterable by star rating, with the
total count.

---

## 9. Teams and multiple branches

### 9.1 Staff accounts with per-section access

The owner creates an account for each person (name and mobile number, optionally
a first password) and chooses which of seven sections they can open: orders, menu,
design, QR codes, sales reports, finance, stock. The order board is given to one
person at a time so two people never move the same ticket. Access changes take
effect on the person's next page load; the owner can set a new password for any
staff member and remove accounts.

### 9.2 Multi-branch chains

- One menu, design and pricing for every branch, edited once at head office.
- Each branch has its own address, menu link and QR codes, tables, orders, order
  board, till close, stock, expenses and revenue.
- Each branch can have its own working hours, or follow head office.
- A **branch manager** account per branch: orders, tables, QR codes, reports,
  finance and stock for that branch only, never the menu.
- **Branch staff** (e.g. a branch cashier), created and managed by the owner.
- A chain console with one row per site: orders, sales, expenses and net profit
  for the month, and the chain total.
- Sold-out dishes are per branch.

### 9.3 Roles

Owner, staff, branch manager and platform admin — each sees only what their role
allows, and a venue's data is never visible to another venue.

---

## 10. Subscriptions and billing

### 10.1 Plans

Plans are defined by the platform team and can set limits on tables, dishes,
categories and daily menu views, and whether branches and online payment are
included. Limits on tables, dishes and categories are enforced; when a limit is
reached the owner gets a clear explanation, not a silent failure. Plans are sold
monthly or yearly (a yearly plan is shown as "2 months free"). The plan comparison
appears on the public pricing page and in the dashboard.

### 10.2 Trial

New sign-ups start on a trial (default 14 days, set by the platform team), with a
countdown in the dashboard.

### 10.3 Online subscription checkout and receipts

Owners can renew or change plan online through Zarinpal, and download a printable
receipt for every payment with both parties' details (the platform's legal name,
national ID, economic code and postal code). The price is always computed on the
server. (Switched off until the gateway is connected — see §14.)

### 10.4 Expiry handling

Warnings appear as the end of the period approaches; after a short grace period
an expired subscription pauses the public menu (see §1.16) until renewal. A
venue's limits are frozen at the terms it paid for, so a later plan change by the
platform does not affect existing subscribers until they renew.

### 10.5 Contract plans

Chains and large venues can be billed by contract: the platform team extends the
period manually after a bank transfer, recorded separately from online payments.

---

## 11. Platform administration (admin console)

### 11.1 Overview

Total and active restaurants, active subscriptions, total orders, monthly
platform revenue, and subscriptions about to expire.

### 11.2 Restaurants

Search, filter (by subscription status and plan) and sort (by name, join date,
expiry, revenue, status) all venues. Each venue's page shows the account, the
subscription, renewal and payment history, the venue's own sales, and lets the
team:

- extend the subscription manually — **paid** (bank transfer) or **gift** —
  with a reason, recorded with who did it and before/after dates (gifts never
  count as revenue);
- set a new password for the owner after confirming who is asking;
- open the venue's public menu.

### 11.3 Create customer accounts

Onboard a restaurant by hand: owner name and mobile, optional first password,
venue name and address, plan and subscription length.

### 11.4 Platform revenue

Subscription revenue over time and per venue (gifts and manual extensions kept
separate).

### 11.5 Expiring subscriptions

A list of venues whose subscriptions end soon, with days remaining.

### 11.6 Support inbox

Venues send support tickets from their dashboard (subject and message); the
team answers and closes them in the console, and the venue sees the reply.

### 11.7 SMS broadcast queue

Paid promotional SMS requests arrive here with their text and audience; the team
downloads the recipient list and updates each request's status after sending.

### 11.8 Plan editor

Edit a plan's name, monthly and yearly price, time-limited promotional prices,
limits, visibility and the feature lines on its card. Every change is shown for
confirmation, saved as a numbered version, and protected against two people
editing at once.

### 11.9 Website content (CMS)

Edit the public website without a developer: the homepage (hero, features,
setup steps), FAQ, pricing page text, About, Contact, Terms, Privacy and Refund
policy. Edits are saved as drafts, previewed by the admin, published when ready,
kept as versions, and any earlier version can be restored. A simple formatting
syntax (headings, lists, emphasis) is used — never raw HTML.

### 11.10 Site settings

Site name, contact phone and email, address, social links (Instagram, Telegram,
Bale, Eitaa), legal details printed on receipts, the eNamad trust badge, SEO
title, description, keywords and link-preview image, trial length, whether the
homepage shows live statistics, and a scheduled announcement bar with text, link
and start/end dates.

### 11.11 Activity (audit) log

A permanent log of security- and money-relevant actions across the platform —
price and bulk price changes, deleted dishes and categories, staff and role
changes, cancellations and refunds, settings changes, subscription extensions,
account creation, data exports, campaigns, SMS requests, phone and password
changes, content publishing, plan edits, sold-out changes, purchases, waste,
stocktakes, table settlements and till closes — with who, when and from where.

### 11.12 Error log

Errors from the server and from guests' and owners' browsers are collected,
grouped (a repeated error is one row with a count), stripped of personal data,
and can be marked resolved or reopened.

### 11.13 Backups

Set the email address that receives the automatic backups and see the last run's
time, size and status.

---

## 12. Public website

- **Homepage** with the product message, real live statistics (number of
  restaurants, orders and templates — no invented figures), features, a
  three-step setup guide, live demo menus for every template, FAQ, and contact
  details.
- **Pricing page** with the plan cards and their features.
- **About, Contact, Terms, Privacy and Refund policy** pages, all editable from
  the admin console.
- **SEO**: page titles and descriptions, a sitemap, robots rules, a link-preview
  image, and the eNamad badge.
- **Announcement bar** for news or promotions, scheduled by date.

---

## 13. Platform foundations

### 13.1 Persian first

The entire product — website, dashboard, menus, printouts, Excel files — is in
Persian, right-to-left, with Persian digits and the Jalali calendar. The
dashboard can also be switched to English.

### 13.2 Mobile first

Every dashboard page and every menu is built for and tested at phone width;
nothing requires a computer or an app.

### 13.3 Light and dark mode

The dashboard and admin console follow the device's light/dark setting or a
manual choice; public menus keep their own design.

### 13.4 Real-time everywhere

New orders and status changes reach every open board and every guest's tracking
page instantly, even when the service runs on several servers.

### 13.5 Security

- Sign-in with mobile number and a strong password (minimum 8 characters, letters
  and digits, not the phone number), stored with a slow, salted hash.
- Wrong-password limits per number and per network address; no answer ever
  reveals whether a number is registered.
- SMS codes used only to prove a number (sign-up, activation, password reset,
  phone change), with expiry, resend cooldown and attempt limits.
- Revocable sessions in secure cookies; requests from other websites are
  refused; rate limits on ordering, sign-in, waiter calls and uploads.
- Every venue's data is strictly separated from every other venue's.
- Prices and totals are always calculated on the server.

### 13.6 Reliable data

- Automatic backups every 12 hours of all data and uploaded photos, kept on disk
  and emailed to the operator, with a tested restore tool.
- Customer files are stored outside the application, so updates never touch
  them.
- A health check reports whether the database and storage are working.

### 13.7 Image handling

Photos are resized in the browser before upload (saving data on mobile) and
checked on the server (type, size and dimensions) before they are stored.

---

## 14. Built, but switched off or limited today

These features exist in the code but are controlled by server switches or have
limits that marketing copy should respect:

| Feature                                                                                     | Status                                                                                                                |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Online payment for guest orders (Zarinpal)                                                  | Built; switched on per server once a Zarinpal merchant account is connected. Until then guests pay on site.           |
| Online subscription checkout                                                                | Built; same switch. Until then subscriptions are extended manually by the platform team.                              |
| Paying for promotional SMS                                                                  | Built; switched off until the gateway is connected. Messages are always sent by the Restokar team, not automatically. |
| Public self-service sign-up                                                                 | Built; switched by the platform. When off, accounts are created by the team from the admin console.                   |
| Daily menu-view limit                                                                       | Views are counted and shown, but the plan limit on daily views is not enforced.                                       |
| Campaigns                                                                                   | Planning only — a campaign does not send messages by itself.                                                          |
| Custom domain per venue                                                                     | Not built; menus live under the platform's address.                                                                   |
| POS hardware, delivery, table reservations, loyalty wallet, accounting-software integration | Not built.                                                                                                            |
