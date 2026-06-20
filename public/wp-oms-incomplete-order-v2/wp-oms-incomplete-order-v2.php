<?php
/**
 * Plugin Name: WP OMS Incomplete Order v2
 * Description: Tracks WooCommerce checkout activity as incomplete orders, pushes them to OMS by callback, and keeps a signed REST API fallback. Auto-marks orders complete when the same session places a real order.
 * Version: 2.1.0
 * Author: OMS
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

class WP_OMS_Incomplete_V2 {
    const VERSION       = '2.1.0';
    const TABLE         = 'oms_incomplete_orders_v2';
    const OPT_SIG       = 'wp_oms_v2_signature';
    const OPT_CALLBACK  = 'wp_oms_v2_callback_url';
    const NS            = 'oms/v2';
    const COOKIE_SID    = 'oms_v2_sid';

    public static function init() {
        register_activation_hook(__FILE__, [__CLASS__, 'on_activate']);
        add_action('rest_api_init',                           [__CLASS__, 'register_routes']);
        add_action('admin_menu',                              [__CLASS__, 'admin_menu']);
        add_action('wp_enqueue_scripts',                      [__CLASS__, 'enqueue_tracker']);
        add_action('woocommerce_checkout_order_processed',    [__CLASS__, 'on_order_placed'], 10, 3);
        add_action('woocommerce_new_order',                   [__CLASS__, 'on_new_order'], 10, 1);
        add_action('wp_ajax_oms_v2_track',                    [__CLASS__, 'ajax_track']);
        add_action('wp_ajax_nopriv_oms_v2_track',             [__CLASS__, 'ajax_track']);
    }

    /* ---------- activation: create table + signature ---------- */
    public static function on_activate() {
        global $wpdb;
        $table   = $wpdb->prefix . self::TABLE;
        $charset = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE $table (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            session_id VARCHAR(64) NOT NULL,
            event_id VARCHAR(64) DEFAULT NULL,
            customer_name VARCHAR(190) DEFAULT '',
            phone VARCHAR(32) DEFAULT '',
            email VARCHAR(190) DEFAULT '',
            address TEXT,
            items LONGTEXT,
            subtotal DECIMAL(12,2) DEFAULT 0,
            shipping DECIMAL(12,2) DEFAULT 0,
            total DECIMAL(12,2) DEFAULT 0,
            status VARCHAR(24) NOT NULL DEFAULT 'processing',
            imported_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_session (session_id),
            KEY idx_status (status),
            KEY idx_phone (phone)
        ) $charset;";
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);

        if (!get_option(self::OPT_SIG)) {
            update_option(self::OPT_SIG, wp_generate_password(40, false, false));
        }
    }

    /* ---------- admin settings page (shows signature) ---------- */
    public static function admin_menu() {
        add_menu_page('OMS Incomplete v2', 'OMS Incomplete v2', 'manage_options',
            'oms-incomplete-v2', [__CLASS__, 'render_admin'], 'dashicons-cart', 56);
    }
    public static function render_admin() {
        if (!current_user_can('manage_options')) return;
        if (isset($_POST['oms_v2_regen']) && check_admin_referer('oms_v2_regen')) {
            update_option(self::OPT_SIG, wp_generate_password(40, false, false));
        }
        if (isset($_POST['oms_v2_save_callback']) && check_admin_referer('oms_v2_save_callback')) {
            update_option(self::OPT_CALLBACK, esc_url_raw($_POST['oms_v2_callback_url'] ?? ''));
        }
        $sig = get_option(self::OPT_SIG, '');
        $callback = get_option(self::OPT_CALLBACK, '');
        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $total      = (int) $wpdb->get_var("SELECT COUNT(*) FROM $t");
        $processing = (int) $wpdb->get_var("SELECT COUNT(*) FROM $t WHERE status='processing'");
        $complete   = (int) $wpdb->get_var("SELECT COUNT(*) FROM $t WHERE status='complete'");
        ?>
        <div class="wrap">
            <h1>OMS Incomplete Order Tracker v2</h1>
            <h2>Plugin Signature</h2>
            <p>Copy this signature and paste into <strong>OMS → Integrations → Plugin Signature</strong>.</p>
            <input type="text" readonly value="<?php echo esc_attr($sig); ?>" style="width:560px;font-family:monospace;padding:8px;" onclick="this.select();" />
            <form method="post" style="display:inline-block;margin-left:10px;">
                <?php wp_nonce_field('oms_v2_regen'); ?>
                <button name="oms_v2_regen" class="button">Regenerate</button>
            </form>
            <h2 style="margin-top:30px">OMS Callback URL</h2>
            <p>Paste the Incomplete Callback URL copied from <strong>OMS → Integrations</strong>. New checkout snapshots will be pushed automatically.</p>
            <form method="post" style="display:flex;gap:8px;align-items:center;max-width:760px;">
                <?php wp_nonce_field('oms_v2_save_callback'); ?>
                <input type="url" name="oms_v2_callback_url" value="<?php echo esc_attr($callback); ?>" placeholder="https://your-oms.app/api/public/webhooks/wp-incomplete?secret=..." style="flex:1;font-family:monospace;padding:8px;" />
                <button name="oms_v2_save_callback" class="button button-primary">Save Callback</button>
            </form>
            <h2 style="margin-top:30px">Stats</h2>
            <ul>
                <li>Total incomplete rows: <strong><?php echo $total; ?></strong></li>
                <li>Processing (pending import): <strong><?php echo $processing; ?></strong></li>
                <li>Complete (already placed real order): <strong><?php echo $complete; ?></strong></li>
            </ul>
            <h2 style="margin-top:30px">REST endpoints</h2>
            <p><code>GET  <?php echo esc_html(rest_url(self::NS . '/incomplete-orders')); ?>?status=processing</code></p>
            <p><code>POST <?php echo esc_html(rest_url(self::NS . '/incomplete-orders/mark-imported')); ?></code></p>
            <p>Both require header <code>X-Plugin-Signature: &lt;signature above&gt;</code>.</p>
        </div>
        <?php
    }

    /* ---------- frontend tracker JS ---------- */
    public static function enqueue_tracker() {
        if (!function_exists('is_checkout') || !is_checkout()) return;
        $handle = 'oms-v2-tracker';
        wp_register_script($handle, '', [], self::VERSION, true);
        wp_enqueue_script($handle);
        $sid = self::get_or_set_sid();
        $eid = wp_generate_uuid4();
        $cfg = [
            'ajax'    => admin_url('admin-ajax.php'),
            'sid'     => $sid,
            'eid'     => $eid,
            'nonce'   => wp_create_nonce('oms_v2_track'),
        ];
        wp_add_inline_script($handle, "window.OMS_V2=" . wp_json_encode($cfg) . ";" . self::tracker_js());
    }

    private static function get_or_set_sid() {
        if (!empty($_COOKIE[self::COOKIE_SID])) return sanitize_text_field($_COOKIE[self::COOKIE_SID]);
        $sid = wp_generate_uuid4();
        @setcookie(self::COOKIE_SID, $sid, time()+86400*30, COOKIEPATH ? COOKIEPATH : '/', COOKIE_DOMAIN);
        $_COOKIE[self::COOKIE_SID] = $sid;
        return $sid;
    }

    private static function tracker_js() {
        return <<<JS
(function(){
  if (!window.OMS_V2) return;
  var cfg = window.OMS_V2;
  var send = function(){
    var data = new FormData();
    data.append('action','oms_v2_track');
    data.append('_wpnonce', cfg.nonce);
    data.append('sid', cfg.sid);
    data.append('eid', cfg.eid);
    var fields = ['billing_first_name','billing_last_name','billing_phone','billing_email','billing_address_1','billing_address_2','billing_city'];
    fields.forEach(function(f){ var el = document.querySelector('[name="'+f+'"]'); if (el) data.append(f, el.value || ''); });
    fetch(cfg.ajax, { method:'POST', credentials:'same-origin', body:data }).catch(function(){});
  };
  var deb = null;
  var trigger = function(){ if (deb) clearTimeout(deb); deb = setTimeout(send, 800); };
  document.addEventListener('change', function(e){ if (e.target && e.target.name && e.target.name.indexOf('billing_') === 0) trigger(); }, true);
  document.addEventListener('input',  function(e){ if (e.target && e.target.name && e.target.name.indexOf('billing_') === 0) trigger(); }, true);
  // Also send once on page load after 3s in case prefilled
  setTimeout(send, 3000);
})();
JS;
    }

    /* ---------- AJAX: receive checkout snapshot ---------- */
    public static function ajax_track() {
        if (!check_ajax_referer('oms_v2_track', '_wpnonce', false)) wp_send_json_error('bad_nonce', 403);
        $sid   = isset($_POST['sid']) ? sanitize_text_field($_POST['sid']) : '';
        $eid   = isset($_POST['eid']) ? sanitize_text_field($_POST['eid']) : '';
        $phone = isset($_POST['billing_phone']) ? sanitize_text_field($_POST['billing_phone']) : '';
        if (!$sid || !$phone) wp_send_json_success(['skipped' => 'no_phone_or_sid']);

        $name  = trim(
            (isset($_POST['billing_first_name']) ? sanitize_text_field($_POST['billing_first_name']) : '') . ' ' .
            (isset($_POST['billing_last_name'])  ? sanitize_text_field($_POST['billing_last_name'])  : '')
        );
        $email = isset($_POST['billing_email']) ? sanitize_email($_POST['billing_email']) : '';
        $addr  = trim(
            (isset($_POST['billing_address_1']) ? sanitize_text_field($_POST['billing_address_1']) : '') . ' ' .
            (isset($_POST['billing_address_2']) ? sanitize_text_field($_POST['billing_address_2']) : '') . ' ' .
            (isset($_POST['billing_city'])      ? sanitize_text_field($_POST['billing_city'])      : '')
        );

        $items_arr = []; $subtotal = 0; $shipping = 0; $total = 0;
        if (function_exists('WC') && WC()->cart) {
            foreach (WC()->cart->get_cart() as $ci) {
                $p = $ci['data'] ?? null; if (!$p) continue;
                $qty   = (int) ($ci['quantity'] ?? 1);
                $price = (float) $p->get_price();
                $items_arr[] = [
                    'product_id'   => (int) ($ci['product_id'] ?? 0),
                    'variation_id' => (int) ($ci['variation_id'] ?? 0),
                    'name'         => $p->get_name(),
                    'sku'          => $p->get_sku(),
                    'quantity'     => $qty,
                    'unit_price'   => $price,
                    'total'        => $qty * $price,
                ];
                $subtotal += $qty * $price;
            }
            $shipping = (float) WC()->cart->get_shipping_total();
            $total    = (float) WC()->cart->get_total('edit');
        }

        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $now = current_time('mysql');
        $existing = $wpdb->get_row($wpdb->prepare("SELECT id, status FROM $t WHERE session_id=%s", $sid));
        if ($existing) {
            if ($existing->status === 'complete') wp_send_json_success(['skipped' => 'already_complete']);
            $wpdb->update($t, [
                'event_id' => $eid, 'customer_name' => $name, 'phone' => $phone, 'email' => $email,
                'address' => $addr, 'items' => wp_json_encode($items_arr),
                'subtotal' => $subtotal, 'shipping' => $shipping, 'total' => $total,
                'updated_at' => $now,
            ], ['id' => (int) $existing->id]);
            $row_id = (int) $existing->id;
        } else {
            $wpdb->insert($t, [
                'session_id' => $sid, 'event_id' => $eid, 'customer_name' => $name, 'phone' => $phone,
                'email' => $email, 'address' => $addr, 'items' => wp_json_encode($items_arr),
                'subtotal' => $subtotal, 'shipping' => $shipping, 'total' => $total,
                'status' => 'processing', 'created_at' => $now, 'updated_at' => $now,
            ]);
            $row_id = (int) $wpdb->insert_id;
        }
        self::push_callback($row_id);
        wp_send_json_success(['ok' => true]);
    }

    private static function push_callback($row_id) {
        $callback = get_option(self::OPT_CALLBACK, '');
        $sig = get_option(self::OPT_SIG, '');
        if (!$callback || !$sig || !$row_id) return;

        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $r = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id=%d", (int) $row_id), ARRAY_A);
        if (!$r || $r['status'] === 'complete') return;

        $item_count = 0;
        $items = json_decode($r['items'] ?: '[]', true);
        if (is_array($items)) {
            foreach ($items as $it) $item_count += max(1, (int) ($it['quantity'] ?? 1));
        } else {
            $items = [];
        }
        if (empty($r['phone']) || $item_count < 1) return;

        wp_remote_post($callback, [
            'timeout' => 8,
            'blocking' => false,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Plugin-Signature' => $sig,
            ],
            'body' => wp_json_encode([
                'items' => [[
                    'id' => (int) $r['id'],
                    'session_id' => $r['session_id'],
                    'event_id' => $r['event_id'],
                    'customer_name' => $r['customer_name'],
                    'phone' => $r['phone'],
                    'email' => $r['email'],
                    'address' => $r['address'],
                    'items' => $items,
                    'subtotal' => (float) $r['subtotal'],
                    'shipping' => (float) $r['shipping'],
                    'total' => (float) $r['total'],
                    'status' => $r['status'],
                    'created_at' => $r['created_at'],
                ]],
            ]),
        ]);
    }

    /* ---------- auto-mark complete when order placed in same session ---------- */
    public static function on_order_placed($order_id, $posted_data, $order) {
        $sid = !empty($_COOKIE[self::COOKIE_SID]) ? sanitize_text_field($_COOKIE[self::COOKIE_SID]) : '';
        if (!$sid) return;
        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $wpdb->update($t, ['status' => 'complete', 'updated_at' => current_time('mysql')], ['session_id' => $sid]);
    }
    public static function on_new_order($order_id) {
        self::on_order_placed($order_id, [], null);
    }

    /* ---------- REST API ---------- */
    public static function register_routes() {
        register_rest_route(self::NS, '/incomplete-orders', [
            'methods'             => 'GET',
            'permission_callback' => [__CLASS__, 'check_sig'],
            'callback'            => [__CLASS__, 'rest_list'],
        ]);
        register_rest_route(self::NS, '/incomplete-orders/mark-imported', [
            'methods'             => 'POST',
            'permission_callback' => [__CLASS__, 'check_sig'],
            'callback'            => [__CLASS__, 'rest_mark_imported'],
        ]);
    }

    public static function check_sig(WP_REST_Request $req) {
        $sig = $req->get_header('x_plugin_signature');
        if (!$sig) $sig = $req->get_header('x-plugin-signature');
        if (!$sig) $sig = $req->get_param('signature');
        $expected = get_option(self::OPT_SIG, '');
        if (!$sig || !$expected || !hash_equals($expected, $sig)) {
            return new WP_Error('forbidden', 'Invalid plugin signature', ['status' => 401]);
        }
        return true;
    }

    public static function rest_list(WP_REST_Request $req) {
        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $status = $req->get_param('status') ?: 'processing';
        $limit  = min(200, max(1, (int) ($req->get_param('limit') ?: 100)));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $t WHERE status=%s AND imported_at IS NULL AND phone <> '' ORDER BY id ASC LIMIT %d",
            $status, $limit
        ), ARRAY_A);
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'            => (int) $r['id'],
                'session_id'    => $r['session_id'],
                'event_id'      => $r['event_id'],
                'customer_name' => $r['customer_name'],
                'phone'         => $r['phone'],
                'email'         => $r['email'],
                'address'       => $r['address'],
                'items'         => json_decode($r['items'] ?: '[]', true),
                'subtotal'      => (float) $r['subtotal'],
                'shipping'      => (float) $r['shipping'],
                'total'         => (float) $r['total'],
                'status'        => $r['status'],
                'created_at'    => $r['created_at'],
            ];
        }
        return ['items' => $out];
    }

    public static function rest_mark_imported(WP_REST_Request $req) {
        $ids = $req->get_param('ids');
        if (!is_array($ids) || empty($ids)) return ['ok' => true, 'marked' => 0];
        $ids = array_map('intval', $ids);
        global $wpdb; $t = $wpdb->prefix . self::TABLE;
        $place = implode(',', array_fill(0, count($ids), '%d'));
        $sql   = $wpdb->prepare("UPDATE $t SET imported_at=NOW() WHERE id IN ($place)", ...$ids);
        $wpdb->query($sql);
        return ['ok' => true, 'marked' => count($ids)];
    }
}

WP_OMS_Incomplete_V2::init();
