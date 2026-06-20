## লক্ষ্য

একটা OMS থেকে অন্য OMS-এ অর্ডার পাঠানো ও গ্রহণ করার ব্যবস্থা। দু'টা OMS-ই একই অ্যাপ (এই কোডবেইজ) — দুজনের কাছেই সিস্টেমটি থাকবে।

---

## কীভাবে কাজ করবে (সংক্ষেপে)

```text
[Sender OMS]  ──HTTPS POST──▶  [Receiver OMS]
   destination       /api/public/oms-inbound       নতুন অর্ডার তৈরি
   (URL+token+name)  header: X-OMS-Token           source = "oms"
                                                   external_order_id = sender#orderNo
                                                   sender_name দেখাবে
```

- **Sender** তার "OMS Destinations" তালিকায় target OMS-গুলোর URL + Token + Name save রাখবে।
- প্রতিটি অর্ডারে "Forward to OMS" বাটন থাকবে → কোন destination(s) এ যাবে select করে পাঠাবে (manual)।
- চাইলে destination-এ "Auto-forward" toggle on করলে নতুন order তৈরি হলে background-এ automatic পাঠাবে।
- **Receiver** এর কাছে inbound API endpoint থাকবে; valid token হলে নতুন অর্ডার তৈরি করবে, sender-এর নাম এবং sender-side order number সংরক্ষণ করবে। Duplicate check হবে না — প্রতিবার নতুন অর্ডার তৈরি হবে (আপনার পছন্দ অনুযায়ী)।

---

## যা যা তৈরি/পরিবর্তন হবে

### ১) ডাটাবেইজ (migration)

দু'টা নতুন টেবিল:

- **`oms_destinations`** (sender side — কোথায় পাঠাবো)
  - `name` (যেমন "Partner OMS A"), `url`, `api_token` (header-এ যাবে), `auto_forward` (boolean), `active`, `created_by`
  - RLS: শুধু admin/business_owner manage করতে পারবে; staff use করতে পারবে শুধু (forward করতে)।

- **`oms_inbound_settings`** (receiver side — কে কে আমার এখানে পাঠাতে পারবে)
  - `sender_name` (যে নাম দেখাবে), `api_token` (এই token যে header-এ পাঠাবে সে accept হবে), `active`
  - RLS: শুধু admin manage করবে।

- **`oms_forward_logs`** (audit/debug)
  - `order_id`, `destination_id`, `direction` (outbound/inbound), `status` (success/failed), `http_status`, `response_excerpt`, `request_excerpt`, `created_at`, `created_by`

- **`orders` টেবিলে দু'টা নতুন column** (receiver-এ data রাখার জন্য):
  - `oms_sender_name text` (যে OMS থেকে এসেছে তার নাম — UI-তে badge হিসেবে দেখাবে)
  - `oms_sender_order_no text` (তাদের original order number)

প্রতিটা নতুন public table-এ proper GRANT + RLS policy যোগ করা হবে।

### ২) Receiver endpoint — `src/routes/api/public/oms-inbound.ts`

- POST handler, `/api/public/oms-inbound` → published-এ auth bypass হয়, তাই handler-এর ভেতরে token verify করব।
- Request header `X-OMS-Token` পড়ে `oms_inbound_settings.api_token`-এর সাথে match করব (timing-safe)। Match হলে ঐ row-এর `sender_name` ব্যবহার হবে।
- Zod দিয়ে body validate করব (customer, items, amounts ইত্যাদি)।
- `supabaseAdmin` দিয়ে নতুন order + order_items insert; `source = 'oms'`, `oms_sender_name`, `oms_sender_order_no`, `external_order_id = sender_name + '#' + order_no` সেট হবে। সবসময় নতুন তৈরি হবে।
- Response: `{ ok: true, order_number, id }` অথবা error JSON।

### ৩) Sender — forwarding logic

- নতুন server function `src/lib/oms-forward.functions.ts`:
  - `forwardOrder({ orderId, destinationIds })` — order + items DB থেকে নিয়ে JSON বানিয়ে প্রতিটা destination-এ POST পাঠাবে, ফলাফল `oms_forward_logs`-এ লিখবে।
  - `listDestinations`, `createDestination`, `updateDestination`, `deleteDestination`, `testDestination` (ping endpoint)।
- Auto-forward: নতুন অর্ডার তৈরি হলে যেসব destination-এ `auto_forward=true`, সেগুলোতে ফায়ার-অ্যান্ড-ফরগেট পাঠাবে। Trigger পয়েন্ট হবে existing "create order" server function-এর শেষে (Auto শুধু manual entry / web sync থেকে আসা order-এ চলবে যাতে loop না হয় — receiver-এ source='oms' হলে auto-forward স্কিপ)।

### ৪) UI

- **Settings → "OMS Destinations" পেজ** (sender config): destination add/edit/delete, auto-forward toggle, "Test connection" বাটন।
- **Settings → "OMS Inbound" পেজ** (receiver config): inbound sender add/edit/delete (Name + Token দিচ্ছি যা partner কে দেব), endpoint URL copy বাটন।
- **Order Detail Dialog-এ "Forward to OMS" বাটন**: destination multi-select → পাঠাবে → success/error toast।
- **Order list/detail-এ badge**: order যদি OMS থেকে এসে থাকে, "From: {sender_name} #{their_no}" badge দেখাবে।
- **Forward Logs view** (Reports-এর পাশে বা destination পেজে drawer): কোন order কখন কোথায় গেছে, fail হলে error সহ।

### ৫) Permissions

`permissions.ts`-এ দুটো নতুন permission যোগ:
- `can_manage_oms_endpoints` (destinations + inbound config) — default শুধু admin/owner
- `can_forward_orders` — staff manual forward করতে পারবে কিনা

---

## Security

- Receiver endpoint `/api/public/*` — auth bypass হয় published-এ, তাই হ্যান্ডলারের ভেতরে token mandatory check।
- Token comparison `timingSafeEqual` দিয়ে।
- Body Zod validation, size limit।
- কোনো PII response-এ leak করব না, শুধু order_number + id ফেরত।
- Token plain-text DB-তে থাকবে (admin শুধু দেখবে); rotate বাটন থাকবে।

## যা **করব না**

- Edge function বানাবো না — সবই TanStack server route/function।
- Receiver-এ duplicate detection logic থাকবে না (আপনার সিদ্ধান্ত অনুসারে), শুধু audit log থাকবে।
- Auto-forward loop ঠেকাতে `source='oms'` order auto-forward হবে না।

---

approve করলে migration আগে চালাবো, তারপর কোড।