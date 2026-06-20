import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MessageCircle, Send, ArrowLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

type ChatUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function playBeep() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}

export function ChatWidget() {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [activeUser, setActiveUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [forcePopup, setForcePopup] = useState(false);
  const [popupMsg, setPopupMsg] = useState<{ msg: ChatMessage; from: ChatUser } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalUnread = useMemo(
    () => Object.values(unreadBySender).reduce((a, b) => a + b, 0),
    [unreadBySender]
  );

  // Load users (other staff/admin)
  useEffect(() => {
    if (!myId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .neq("id", myId)
        .order("full_name", { ascending: true });
      setUsers((data ?? []) as ChatUser[]);
    })();
  }, [myId]);

  // Load my own force-popup flag (refresh when widget opens too)
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("chat_force_popup")
        .eq("id", myId)
        .maybeSingle();
      if (!cancelled) setForcePopup(!!(data as { chat_force_popup?: boolean } | null)?.chat_force_popup);
    })();
    return () => { cancelled = true; };
  }, [myId]);


  // Load unread counts
  const refreshUnread = useCallback(async () => {
    if (!myId) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("sender_id")
      .eq("receiver_id", myId)
      .is("read_at", null);
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[r.sender_id] = (map[r.sender_id] ?? 0) + 1;
    });
    setUnreadBySender(map);
  }, [myId]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Keep latest forcePopup + users + activeUser available inside the realtime callback
  const forcePopupRef = useRef(forcePopup);
  const usersRef = useRef(users);
  useEffect(() => { forcePopupRef.current = forcePopup; }, [forcePopup]);
  useEffect(() => { usersRef.current = users; }, [users]);

  // Realtime: incoming messages
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`chat:${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `receiver_id=eq.${myId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          playBeep();
          setUnreadBySender((prev) => ({ ...prev, [m.sender_id]: (prev[m.sender_id] ?? 0) + 1 }));
          // If currently viewing this conversation, append + mark read
          setActiveUser((curr) => {
            if (curr && curr.id === m.sender_id) {
              setMessages((prevMsgs) => [...prevMsgs, m]);
              supabase.from("chat_messages").update({ read_at: new Date().toISOString() })
                .eq("id", m.id).then(() => {
                  setUnreadBySender((u) => { const c = { ...u }; delete c[m.sender_id]; return c; });
                });
            } else if (forcePopupRef.current) {
              // Force-popup: show centered modal that user must acknowledge
              const from = usersRef.current.find((u) => u.id === m.sender_id)
                ?? { id: m.sender_id, full_name: null, email: null, avatar_url: null };
              setPopupMsg({ msg: m, from });
            }
            return curr;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId]);

  // Load conversation when activeUser changes
  useEffect(() => {
    if (!activeUser || !myId) return;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${myId},receiver_id.eq.${activeUser.id}),and(sender_id.eq.${activeUser.id},receiver_id.eq.${myId})`
        )
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data ?? []) as ChatMessage[]);
      // mark all from active user as read
      await supabase
        .from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", activeUser.id)
        .eq("receiver_id", myId)
        .is("read_at", null);
      setUnreadBySender((u) => { const c = { ...u }; delete c[activeUser.id]; return c; });
    })();
  }, [activeUser, myId]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeUser]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !activeUser || !myId) return;
    setDraft("");
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ sender_id: myId, receiver_id: activeUser.id, content: text })
      .select("*")
      .single();
    if (!error && data) {
      setMessages((prev) => [...prev, data as ChatMessage]);
    }
  };

  if (!myId) return null;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open chat"
        className={cn(
          "fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-colors",
          totalUnread > 0
            ? "bg-destructive text-destructive-foreground animate-pulse"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        <MessageCircle className="h-6 w-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive border-2 border-background text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="flex items-center gap-2 min-w-0">
              {activeUser && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActiveUser(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="text-sm font-medium truncate">
                {activeUser ? (activeUser.full_name || activeUser.email || "User") : "Messages"}
              </span>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!activeUser ? (
            <ScrollArea className="flex-1">
              <ul className="divide-y">
                {users.length === 0 && (
                  <li className="p-4 text-center text-sm text-muted-foreground">No other users yet.</li>
                )}
                {users.map((u) => {
                  const unread = unreadBySender[u.id] ?? 0;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setActiveUser(u)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent text-left"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatar_url ?? undefined} />
                          <AvatarFallback>{(u.full_name || u.email || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{u.full_name || u.email || "User"}</div>
                          {u.email && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
                        </div>
                        {unread > 0 && (
                          <span className="min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-background/40">
                {messages.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hi 👋</div>
                )}
                {messages.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
                          mine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        )}
                      >
                        {m.content}
                        <div className={cn("text-[10px] mt-0.5 opacity-70", mine ? "text-right" : "text-left")}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="border-t p-2 flex items-center gap-2"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" size="icon" disabled={!draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Force-popup: blocking centered modal for users with chat_force_popup = true */}
      {popupMsg && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-card border-2 border-destructive rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              New message — please read
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={popupMsg.from.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(popupMsg.from.full_name || popupMsg.from.email || "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {popupMsg.from.full_name || popupMsg.from.email || "User"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(popupMsg.msg.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-muted px-3 py-3 text-sm whitespace-pre-wrap break-words">
                {popupMsg.msg.content}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const msg = popupMsg.msg;
                    // Optimistic close — don't block on network
                    setPopupMsg(null);
                    setUnreadBySender((u) => {
                      const c = { ...u };
                      const left = (c[msg.sender_id] ?? 1) - 1;
                      if (left <= 0) delete c[msg.sender_id];
                      else c[msg.sender_id] = left;
                      return c;
                    });
                    supabase.from("chat_messages")
                      .update({ read_at: new Date().toISOString() })
                      .eq("id", msg.id)
                      .then(() => {});
                  }}
                >
                  Acknowledge
                </Button>
                <Button
                  onClick={() => {
                    const from = popupMsg.from;
                    setActiveUser(from);
                    setOpen(true);
                    setPopupMsg(null);
                  }}
                >
                  Reply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
