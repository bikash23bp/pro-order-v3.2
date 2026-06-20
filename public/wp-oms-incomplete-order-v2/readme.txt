=== WP OMS Incomplete Order Tracker v2 ===
Contributors: OMS
Tags: woocommerce, abandoned-cart, incomplete-orders
Requires PHP: 7.4
Stable tag: 2.1.0
License: GPLv2 or later

== Install ==
1. Upload the `wp-oms-incomplete-order-v2` folder to `/wp-content/plugins/` (or upload the zip via Plugins → Add New).
2. Activate. A table `{prefix}oms_incomplete_orders_v2` and a random signature are created automatically.
3. In OMS → Integrations, copy the Incomplete Callback URL.
4. Open WP-Admin → "OMS Incomplete v2", paste the callback URL, and save.
5. Copy the plugin signature from WP-Admin and paste it into OMS → Integrations → Plugin Signature, then Save.

== Behavior ==
- Tracks each visitor's checkout form (auto + manual typing) when they have a phone number.
- Pushes incomplete checkout snapshots to OMS automatically by callback.
- One row per session (UNIQUE session_id). Same session never duplicates.
- If the customer actually places the order, the row is auto-flipped to status `complete` and is NOT returned to OMS.
- REST API:
  - GET  /wp-json/oms/v2/incomplete-orders?status=processing  (header: X-Plugin-Signature)
  - POST /wp-json/oms/v2/incomplete-orders/mark-imported      body: {ids:[...]}
