type ForwardResult = {
  destination_id: string;
  destination_name: string;
  ok: boolean;
  http_status: number | null;
  remote_order_no: string | null;
  error: string | null;
};

export async function buildOrderPayload(supabase: any, orderId: string) {
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, invoice_number, customer_name, customer_phone, customer_email, customer_address, status, subtotal, discount_amount, advance_amount, delivery_charge, total_amount, invoice_note, internal_note, delivery_method, preorder, preorder_date, source, created_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!order) throw new Error("Order not found");

  const { data: items, error: iErr } = await supabase
    .from("order_items")
    .select("quantity, unit_price, products:products(name, sku)")
    .eq("order_id", orderId);
  if (iErr) throw new Error(iErr.message);

  return {
    sender_order_no: String(order.order_number),
    sender_invoice_number: order.invoice_number ?? null,
    sender_source: order.source ?? null,
    created_at: order.created_at,
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      address: order.customer_address,
    },
    amounts: {
      subtotal: Number(order.subtotal) || 0,
      discount_amount: Number(order.discount_amount) || 0,
      advance_amount: Number(order.advance_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      total_amount: Number(order.total_amount) || 0,
    },
    delivery_method: order.delivery_method ?? null,
    preorder: !!order.preorder,
    preorder_date: order.preorder_date ?? null,
    invoice_note: order.invoice_note ?? null,
    internal_note: order.internal_note ?? null,
    items: (items ?? []).map((it: any) => ({
      product_name: it.products?.name ?? "Item",
      sku: it.products?.sku ?? null,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
    })),
  };
}

export async function sendToDestination(
  supabase: any,
  userId: string | null,
  orderId: string,
  destination: { id: string; name: string; url: string; api_token: string },
  payload: unknown,
): Promise<ForwardResult> {
  const result: ForwardResult = {
    destination_id: destination.id,
    destination_name: destination.name,
    ok: false,
    http_status: null,
    remote_order_no: null,
    error: null,
  };
  let respText = "";
  try {
    const res = await fetch(destination.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OMS-Token": destination.api_token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    result.http_status = res.status;
    respText = await res.text();
    if (res.ok) {
      try {
        const j = JSON.parse(respText);
        if (j?.ok === false) {
          result.error = j?.error || `Remote rejected (status ${res.status})`;
        } else {
          result.ok = true;
          result.remote_order_no = j?.order_number != null ? String(j.order_number) : null;
        }
      } catch {
        result.ok = true;
      }
    } else {
      result.error = `HTTP ${res.status}: ${respText.slice(0, 200)}`;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Network error";
  }

  await supabase.from("oms_forward_logs").insert({
    order_id: orderId,
    destination_id: destination.id,
    destination_name: destination.name,
    direction: "outbound",
    status: result.ok ? "success" : "failed",
    http_status: result.http_status,
    remote_order_no: result.remote_order_no,
    error_message: result.error,
    payload_excerpt: JSON.stringify(payload).slice(0, 1000),
    response_excerpt: respText.slice(0, 1000),
    created_by: userId,
  });

  if (result.ok) {
    await supabase
      .from("orders")
      .update({ forwarded_to_partner_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("forwarded_to_partner_at", null);
  }

  return result;
}