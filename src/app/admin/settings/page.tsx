"use client";

import { useEffect, useState } from "react";
import { useAdminStore } from "@/lib/admin-store";
import { Btn, Input, SectionTitle, Toggle } from "@/components/ui/bits";
import { Card, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { fmtHM, fmtMoney } from "@/lib/format";
import type { ClubTable, Product, ReservationRequest, StaffRole, TableType } from "@/lib/types";
import { CLUB_FIELD_LIMITS, ROLE_LABELS } from "@/lib/types";
import { reservationRequestsApi } from "@/lib/reservation-requests-client";

type Tab = "tables" | "products" | "loyalty" | "reservation" | "club" | "telegram" | "staff" | "audit";

const TABS: [Tab, string][] = [
  ["tables", "🎱 Stollar"],
  ["products", "🛒 Mahsulotlar"],
  ["loyalty", "⭐ Loyalty"],
  ["reservation", "📅 Bron"],
  ["club", "🏛 Klub"],
  ["telegram", "📡 Telegram"],
  ["staff", "👥 Xodimlar"],
  ["audit", "📜 Audit"],
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("tables");
  const { currentStaff } = useAdminStore();
  const isSuper = currentStaff.role === "super_admin";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Sozlamalar</h1>
        <p className="mt-1 text-[13px] text-surfaceMuted-foreground">Klub, stollar, mahsulotlar va xodimlar konfiguratsiyasi</p>
      </div>

      {!isSuper && (
        <div className="mb-4 rounded-card border border-primary/20 bg-primary/8 px-4 py-3 text-xs text-primary">
          Sozlamalarni faqat Super Admin o&#39;zgartira oladi.
        </div>
      )}
      <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
              tab === t ? "bg-primary/70 text-foreground " : "bg-card text-surfaceMuted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tables" && <TablesTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "loyalty" && <LoyaltyTab />}
      {tab === "reservation" && <ReservationTab />}
      {tab === "club" && <ClubTab />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

// ─── Stollar (data table) ────────────────────────────────────────────
function TablesTab() {
  const store = useAdminStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const billiard = store.tables.filter((t) => !t.archived && t.type === "billiard");
  const tennis = store.tables.filter((t) => !t.archived && t.type === "tennis");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <CardHeader title="Billiard stollar" />
        <button
          onClick={() => setAdding(true)}
          className="mb-3.5 rounded-control border border-primary/25 px-3 py-1.5 text-xs font-medium text-primary/90 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          + Stol qo&#39;shish
        </button>
      </div>
      <TableGrid tables={billiard} editing={editing} setEditing={setEditing} />

      {tennis.length > 0 && (
        <>
          <div className="mt-6">
            <CardHeader title="Tennis stollar" />
          </div>
          <TableGrid tables={tennis} editing={editing} setEditing={setEditing} />
        </>
      )}

      {adding && (
        <div className="mt-4">
          <TableForm
            onSave={(t) => {
              store.addTable({
                number: t.number ?? 0,
                name: t.name ?? "",
                type: t.type ?? "billiard",
                tier: t.tier ?? "standard",
                pricePerHour: t.pricePerHour ?? 40000,
                onlineReservable: t.onlineReservable ?? false,
                enabled: true,
                archived: false,
              });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
}

function TableGrid({
  tables,
  editing,
  setEditing,
}: {
  tables: ClubTable[];
  editing: string | null;
  setEditing: (id: string | null) => void;
}) {
  const store = useAdminStore();
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  return (
    <Card padding="none" className="overflow-hidden p-0">
      {/* Desktop/tablet — jadval ko'rinishi (sm va kattaroq) */}
      <div className="hidden overflow-x-auto sm:block">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2.5rem_1fr_5.5rem_2.5rem_4.5rem_4.5rem_4.5rem] gap-2 bg-cardElevated/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-surfaceMuted-foreground">
            <span>№</span>
            <span>Nomi</span>
            <span>Narxi</span>
            <span>VIP</span>
            <span>Bron</span>
            <span>Holat</span>
            <span className="text-right">Amallar</span>
          </div>
          {tables.map((t, i) =>
            editing === t.id ? (
              <div key={t.id} className="border-t border-edge p-3">
                <TableForm
                  initial={t}
                  onSave={(patch) => {
                    store.updateTable(t.id, patch);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                  onArchive={() => {
                    store.updateTable(t.id, { archived: true });
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <div
                key={t.id}
                className={`grid grid-cols-[2.5rem_1fr_5.5rem_2.5rem_4.5rem_4.5rem_4.5rem] items-center gap-2 border-t border-edge px-3 py-2.5 text-sm ${
                  i % 2 ? "bg-card/40" : ""
                }`}
              >
                <span className="text-surfaceMuted-foreground">{t.number}</span>
                <span className="font-medium text-foreground">Stol {t.name}</span>
                <span className="text-foreground/80">{fmtMoney(t.pricePerHour)}</span>
                <span className="text-foreground/80">{t.tier === "vip" ? "Ha" : "Yo'q"}</span>
                <span className="text-foreground/80">{t.onlineReservable ? "Ha" : "Yo'q"}</span>
                <span>
                  <Badge tone={t.enabled ? "green" : "muted"}>{t.enabled ? "Aktiv" : "O'chiq"}</Badge>
                </span>
                <RowActions
                  onEdit={() => setEditing(t.id)}
                  confirming={confirmArchive === t.id}
                  onArchiveAsk={() => setConfirmArchive(t.id)}
                  onArchiveCancel={() => setConfirmArchive(null)}
                  onArchiveConfirm={() => {
                    store.updateTable(t.id, { archived: true });
                    setConfirmArchive(null);
                  }}
                />
              </div>
            )
          )}
        </div>
      </div>

      {/* Mobil — vertikal karta ro'yxati (Amallar doim ko'rinadi) */}
      <div className="sm:hidden">
        {tables.map((t, i) =>
          editing === t.id ? (
            <div key={t.id} className={`p-3 ${i !== 0 ? "border-t border-edge" : ""}`}>
              <TableForm
                initial={t}
                onSave={(patch) => {
                  store.updateTable(t.id, patch);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
                onArchive={() => {
                  store.updateTable(t.id, { archived: true });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-2 px-3.5 py-3 ${i !== 0 ? "border-t border-edge" : ""} ${
                i % 2 ? "bg-card/40" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-surfaceMuted-foreground">№{t.number}</span>
                  <span className="truncate text-sm font-semibold text-foreground">Stol {t.name}</span>
                  {t.tier === "vip" && <span className="text-[10px] font-bold text-secondary">VIP</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-surfaceMuted-foreground">
                  <span>{fmtMoney(t.pricePerHour)} so&#39;m/soat</span>
                  <Badge tone={t.enabled ? "green" : "muted"}>{t.enabled ? "Aktiv" : "O'chiq"}</Badge>
                </div>
              </div>
              <RowActions
                className="flex shrink-0 gap-1.5"
                onEdit={() => setEditing(t.id)}
                confirming={confirmArchive === t.id}
                onArchiveAsk={() => setConfirmArchive(t.id)}
                onArchiveCancel={() => setConfirmArchive(null)}
                onArchiveConfirm={() => {
                  store.updateTable(t.id, { archived: true });
                  setConfirmArchive(null);
                }}
              />
            </div>
          )
        )}
      </div>
    </Card>
  );
}

function RowActions({
  onEdit,
  confirming,
  onArchiveAsk,
  onArchiveCancel,
  onArchiveConfirm,
  className = "flex justify-end gap-1",
}: {
  onEdit: () => void;
  confirming: boolean;
  onArchiveAsk: () => void;
  onArchiveCancel: () => void;
  onArchiveConfirm: () => void;
  className?: string;
}) {
  return (
    <span className={className}>
      <button
        onClick={onEdit}
        className="flex h-8 w-8 items-center justify-center rounded-md bg-cardElevated text-sm text-foreground/70 hover:text-foreground"
        aria-label="Tahrirlash"
      >
        ✎
      </button>
      {confirming ? (
        <>
          <button
            onClick={onArchiveConfirm}
            className="h-8 rounded-md bg-destructive px-2 text-[11px] font-bold text-dark"
          >
            Tasdiqlash
          </button>
          <button
            onClick={onArchiveCancel}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-cardElevated text-sm text-foreground/70"
            aria-label="Bekor"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={onArchiveAsk}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-cardElevated text-sm text-destructive/80 hover:text-destructive"
          aria-label="Arxivlash"
        >
          🗑
        </button>
      )}
    </span>
  );
}

function TableForm({
  initial,
  onSave,
  onCancel,
  onArchive,
}: {
  initial?: ClubTable;
  onSave: (t: Partial<ClubTable>) => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  const store = useAdminStore();
  const [type, setType] = useState<TableType>(initial?.type ?? "billiard");
  const nextNum =
    Math.max(0, ...store.tables.filter((t) => t.type === type).map((t) => t.number)) + 1;
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.pricePerHour ?? 40000));
  const [vip, setVip] = useState(initial?.tier === "vip");
  const [online, setOnline] = useState(initial?.onlineReservable ?? false);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  return (
    <div className="rounded-card border border-edge bg-cardElevated p-4">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TableType)}
          className="rounded-control border border-edge bg-card px-3 py-3 text-sm text-foreground"
          disabled={!!initial}
        >
          <option value="billiard">🎱 Billiard</option>
          <option value="tennis">🏓 Tennis</option>
        </select>
        <Input
          value={name}
          onChange={setName}
          placeholder={type === "tennis" ? `T${nextNum}` : `№${nextNum}`}
        />
        <Input value={price} onChange={setPrice} placeholder="Narx / soat" type="number" />
        <div className="flex items-center justify-between rounded-control bg-card px-4 py-2">
          <span className="text-xs text-surfaceMuted-foreground">VIP</span>
          <Toggle on={vip} onChange={setVip} />
        </div>
        <div className="flex items-center justify-between rounded-control bg-card px-4 py-2">
          <span className="text-xs text-surfaceMuted-foreground">Online bron</span>
          <Toggle on={online} onChange={setOnline} />
        </div>
        {initial && (
          <div className="flex items-center justify-between rounded-control bg-card px-4 py-2">
            <span className="text-xs text-surfaceMuted-foreground">Yoqilgan</span>
            <Toggle on={enabled} onChange={setEnabled} />
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Btn
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              number: initial?.number ?? nextNum,
              name: name || (type === "tennis" ? `T${nextNum}` : `№${nextNum}`),
              type,
              tier: vip ? "vip" : "standard",
              pricePerHour: Number(price) || 40000,
              onlineReservable: online,
              enabled,
            })
          }
        >
          ✓ Saqlash
        </Btn>
        <Btn onClick={onCancel}>Bekor</Btn>
        {onArchive && (
          <Btn variant="danger" onClick={onArchive}>
            Arxivlash
          </Btn>
        )}
      </div>
      {onArchive && (
        <div className="mt-2 text-[11px] text-surfaceMuted-foreground">
          Arxivlashda tarix o&#39;chirilmaydi — stol faqat grid&#39;dan yashiriladi.
        </div>
      )}
    </div>
  );
}

// ─── Mahsulotlar ───────────────────────────────────────────────────────
function ProductsTab() {
  const store = useAdminStore();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [emoji, setEmoji] = useState("🥤");
  const [catId, setCatId] = useState(store.categories[0]?.id ?? "");
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState<Record<string, boolean>>({});
  const isSuper = store.currentStaff.role === "super_admin";

  return (
    <div>
      {store.categories.map((c) => {
        const items = store.products.filter((p) => p.categoryId === c.id && p.active);
        const archived = store.products.filter((p) => p.categoryId === c.id && !p.active);
        return (
          <div key={c.id} className="mb-5">
            <CardHeader title={`${c.emoji} ${c.name}`} count={items.length} />
            <Card padding="none" className="overflow-hidden p-0">
              {items.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={c.emoji} title="Mahsulot yo'q" />
                </div>
              ) : (
                items.map((p, i) =>
                  editing === p.id ? (
                    <div
                      key={p.id}
                      className={`p-3 ${i !== items.length - 1 ? "border-b border-edge" : ""}`}
                    >
                      <ProductForm
                        initial={p}
                        onSave={(patch) => {
                          store.updateProduct(p.id, patch);
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ) : (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        i !== items.length - 1 ? "border-b border-edge" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{p.emoji}</span>
                        <div>
                          <div className="text-sm font-medium text-foreground">{p.name}</div>
                          <div className="text-xs text-surfaceMuted-foreground">
                            {fmtMoney(p.price)} so&#39;m
                            {isSuper && p.unitCost > 0 && (
                              <span className="text-foreground/40"> · tannarx {fmtMoney(p.unitCost)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => store.updateProduct(p.id, { available: !p.available })}>
                          <Badge tone={p.available ? "green" : "red"}>
                            {p.available ? "Bor" : "Tugagan"}
                          </Badge>
                        </button>
                        {isSuper && (
                          <button
                            onClick={() => store.updateProduct(p.id, { trackInventory: !p.trackInventory })}
                            title="Ombor kuzatuvi — yoqilsa, Moliya → Ombor xaridi orqali stok/tannarx kuzatiladi"
                          >
                            <Badge tone={p.trackInventory ? "blue" : "muted"}>
                              📦 {p.trackInventory ? `${p.stockQty} dona` : "Ombor yo'q"}
                            </Badge>
                          </button>
                        )}
                        {isSuper && (
                          <span className="flex gap-1">
                            <button
                              onClick={() => setEditing(p.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-cardElevated text-xs text-foreground/70 hover:text-foreground"
                              aria-label="Tahrirlash"
                            >
                              ✎
                            </button>
                            {confirmDelete === p.id ? (
                              <>
                                <button
                                  onClick={() => {
                                    store.updateProduct(p.id, { active: false });
                                    setConfirmDelete(null);
                                  }}
                                  className="h-7 rounded-md bg-destructive px-2 text-[11px] font-bold text-dark"
                                >
                                  Tasdiqlash
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-cardElevated text-xs text-foreground/70"
                                  aria-label="Bekor"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(p.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-cardElevated text-xs text-destructive/80 hover:text-destructive"
                                aria-label="O'chirish"
                              >
                                🗑
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </Card>

            {archived.length > 0 && (
              <div className="mt-1.5">
                <button
                  onClick={() => setShowArchived((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  className="px-1 text-[11px] text-surfaceMuted-foreground hover:text-foreground"
                >
                  {showArchived[c.id] ? "▾" : "▸"} Arxivlangan ({archived.length})
                </button>
                {showArchived[c.id] && (
                  <Card padding="none" className="mt-1.5 overflow-hidden p-0">
                    {archived.map((p, i) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-4 py-2.5 opacity-50 ${
                          i !== archived.length - 1 ? "border-b border-edge" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{p.emoji}</span>
                          <div>
                            <div className="text-sm font-medium text-foreground">{p.name}</div>
                            <div className="text-xs text-surfaceMuted-foreground">{fmtMoney(p.price)} so&#39;m</div>
                          </div>
                        </div>
                        {isSuper && (
                          <button
                            onClick={() => store.updateProduct(p.id, { active: true })}
                            className="rounded-control border border-primary/25 px-2.5 py-1 text-[11px] font-medium text-primary/90"
                          >
                            ↺ Tiklash
                          </button>
                        )}
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            )}
          </div>
        );
      })}

      <SectionTitle>Yangi mahsulot</SectionTitle>
      <Card className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={setName} placeholder="Nomi" />
        <Input value={price} onChange={setPrice} placeholder="Sotuv narxi" type="number" />
        <Input value={cost} onChange={setCost} placeholder="Original/tannarx narxi (ixtiyoriy)" type="number" />
        <Input value={emoji} onChange={setEmoji} placeholder="Emoji" />
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          className="col-span-2 rounded-control border border-edge bg-cardElevated px-3 py-3 text-sm text-foreground"
        >
          {store.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <Btn
          variant="primary"
          className="col-span-2"
          disabled={!name || !price}
          onClick={() => {
            store.addProduct({
              categoryId: catId,
              name,
              price: Number(price),
              emoji: emoji || "🛒",
              available: true,
              active: true,
              // Ombor kuzatuvi hozircha Sozlamalar UI'da yo'q — Finance UI
              // bosqichida (STEP4) qo'shiladi. Standart: kuzatilmaydi.
              trackInventory: false,
              // Original/tannarx narxi — ixtiyoriy (2026-08, "product cost
              // price"). Bo'sh qoldirilsa 0 (backward-compatible, eski
              // mahsulotlar bilan bir xil holat).
              unitCost: Number(cost) || 0,
              stockQty: 0,
            });
            setName("");
            setPrice("");
            setCost("");
          }}
        >
          + Qo&#39;shish
        </Btn>
      </Card>

      <SectionTitle>Yangi kategoriya</SectionTitle>
      <div className="flex gap-2">
        <Input value={newCat} onChange={setNewCat} placeholder="Masalan: Shirinliklar" />
        <Btn
          variant="gold"
          disabled={!newCat}
          onClick={() => {
            store.addCategory(newCat, "🍰");
            setNewCat("");
          }}
        >
          +
        </Btn>
      </div>
    </div>
  );
}

function ProductForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Product;
  onSave: (p: Partial<Product>) => void;
  onCancel: () => void;
}) {
  const store = useAdminStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [cost, setCost] = useState(initial?.unitCost ? String(initial.unitCost) : "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🥤");
  const [catId, setCatId] = useState(initial?.categoryId ?? store.categories[0]?.id ?? "");

  return (
    <div className="rounded-card border border-edge bg-cardElevated p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={setName} placeholder="Nomi" />
        <Input value={price} onChange={setPrice} placeholder="Sotuv narxi" type="number" />
        <Input value={cost} onChange={setCost} placeholder="Original/tannarx narxi (ixtiyoriy)" type="number" />
        <Input value={emoji} onChange={setEmoji} placeholder="Emoji" />
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          className="col-span-2 rounded-control border border-edge bg-card px-3 py-3 text-sm text-foreground"
        >
          {store.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2.5 flex gap-2">
        <Btn
          variant="primary"
          className="flex-1"
          disabled={!name || !price}
          onClick={() =>
            onSave({
              name,
              price: Number(price) || 0,
              // Original/tannarx narxi — ixtiyoriy (2026-08, "product cost
              // price"). Bo'sh qoldirilsa 0 (backward-compatible).
              unitCost: Number(cost) || 0,
              emoji: emoji || "🛒",
              categoryId: catId,
            })
          }
        >
          ✓ Saqlash
        </Btn>
        <Btn onClick={onCancel}>Bekor</Btn>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-surfaceMuted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-control border border-edge bg-cardElevated px-2 py-1.5 text-right text-sm text-foreground"
        />
        {suffix && <span className="text-xs text-surfaceMuted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: React.ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function LoyaltyTab() {
  const store = useAdminStore();
  const L = store.settings.loyalty;
  const set = (patch: Partial<typeof L>) =>
    store.updateSettings({ loyalty: { ...L, ...patch } });

  return (
    <div>
      <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
        <ToggleRow label="Loyalty tizimi" on={L.enabled} onChange={(v) => set({ enabled: v })} />
        <NumField label="1 ball uchun o'yin" value={L.minutesPerPoint} onChange={(n) => set({ minutesPerPoint: n })} suffix="daqiqa" />
        <NumField label="Mukofot uchun ball" value={L.pointsForReward} onChange={(n) => set({ pointsForReward: n })} suffix="ball" />
        <NumField label="Mukofot davomiyligi" value={L.rewardMinutes} onChange={(n) => set({ rewardMinutes: n })} suffix="daqiqa" />
        <NumField label="Mukofot uchun minimal sessiya" value={L.minSessionMinutesForReward} onChange={(n) => set({ minSessionMinutesForReward: n })} suffix="daqiqa" />
      </Card>
      <div className="mt-3 rounded-card border border-primary/20 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-primary">
        Ballar faqat <b>avtomatik</b> hisoblanadi — sessiya yopilganda, telefon
        biriktirilgan bo&#39;lsa. Xodimlar qo&#39;lda ball qo&#39;sha olmaydi. Korreksiya
        faqat Super Admin uchun.
      </div>
    </div>
  );
}

/**
 * 2026-08 — mijozning "oldindan bron"i avtomatik hold/deposit'dan
 * "Bog'lanish so'rovi"ga TO'LIQ ALMASHTIRILDI: mijoz endi faqat telefon
 * raqamini qoldiradi, admin o'zi qo'ng'iroq qiladi. Shu sababli
 * "Online bron stollar limiti" va "To'lov timeout" (faqat eski
 * avtomatik-hold oqimiga tegishli edi) olib tashlandi — "Yoqilgan" +
 * Depozit/Saqlash muddati (xodimning QO'LDA bron qilish vositasi, POST
 * /api/reservations, uchun hali ham kerak) qoladi.
 */
function ReservationTab() {
  const store = useAdminStore();
  const R = store.settings.reservation;
  const set = (patch: Partial<typeof R>) =>
    store.updateSettings({ reservation: { ...R, ...patch } });
  const onlineCount = store.tables.filter((t) => !t.archived && t.onlineReservable).length;

  return (
    <div>
      <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
        <ToggleRow label="Mijozlar bog'lanish so'rovi qoldira oladimi" on={R.enabled} onChange={(v) => set({ enabled: v })} />
        <NumField label="Depozit (qo'lda bron uchun)" value={R.deposit} onChange={(n) => set({ deposit: n })} suffix="so'm" />
        <NumField label="Saqlash muddati (qo'lda bron uchun)" value={R.holdMinutes} onChange={(n) => set({ holdMinutes: n })} suffix="daqiqa" />
      </Card>
      <div className="mt-3 rounded-card border border-primary/20 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-primary">
        Mijoz Mini App&#39;da bo&#39;sh stol uchun telefon raqamini qoldiradi — avtomatik
        band qilinmaydi. Pastdagi ro&#39;yxatdan so&#39;rovni ko&#39;rib, mijozga qo&#39;ng&#39;iroq
        qiling; kelishilsa, stollar sahifasidan xodim vositasi bilan qo&#39;lda bron
        qiling (shu holda yuqoridagi depozit/saqlash muddati ishlatiladi). Hozir
        online bronga ochiq stollar: <span className="font-semibold">{onlineCount} ta</span>.
      </div>
      <ReservationRequestsList />
    </div>
  );
}

function ReservationRequestsList() {
  const [requests, setRequests] = useState<ReservationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const store = useAdminStore();

  const load = () => {
    reservationRequestsApi
      .list("pending")
      .then((r) => setRequests(r.requests))
      .catch((e: any) => setError(e?.message ?? "Yuklashda xatolik"));
  };

  useEffect(load, []);

  const tableName = (id: string) => store.tables.find((t) => t.id === id)?.name ?? "?";

  const contact = async (id: string) => {
    setBusyId(id);
    try {
      await reservationRequestsApi.contact(id);
      load();
    } catch (e: any) {
      setError(e?.message ?? "Xatolik");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await reservationRequestsApi.cancel(id);
      load();
    } catch (e: any) {
      setError(e?.message ?? "Xatolik");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-5">
      <SectionTitle>Bog&#39;lanish so&#39;rovlari{requests?.length ? ` (${requests.length})` : ""}</SectionTitle>
      {error && <div className="mb-2 text-xs font-medium text-destructive">{error}</div>}
      {requests === null ? (
        <div className="text-xs text-surfaceMuted-foreground">Yuklanmoqda...</div>
      ) : requests.length === 0 ? (
        <EmptyState title="So'rov yo'q" subtitle="Hozircha kutilayotgan bog'lanish so'rovlari yo'q." />
      ) : (
        <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  Stol {tableName(r.tableId)} — {r.customerPhone}
                </div>
                {r.note && <div className="mt-0.5 truncate text-xs text-surfaceMuted-foreground">&#34;{r.note}&#34;</div>}
                <div className="mt-0.5 text-[11px] text-surfaceMuted-foreground">{fmtHM(r.createdAt)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Btn className="!px-3 !py-1.5 !text-[12px]" variant="primary" disabled={busyId === r.id} onClick={() => contact(r.id)}>
                  Bog&#39;landim
                </Btn>
                <Btn className="!px-3 !py-1.5 !text-[12px]" variant="ghost" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                  Bekor
                </Btn>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// "Klub" formasi maydonlari — DIQQAT: ilgari har bir onChange'da ALOHIDA
// server so'rovi (updateSettings) yuborilar edi. Uzun matn ("Klub haqida")
// yozishda bu o'nlab PARALLEL PATCH so'rovi degani edi — javoblar
// tartibsiz qaytishi (masalan 5-harfdan keyingi javob 20-harfdan
// keyingisidan OLDIN kelishi) mumkin edi, va har bir javob textarea
// qiymatini O'SHA (ko'pincha qisqaroq/eskiroq) matn bilan almashtirar
// edi — foydalanuvchiga "matn sig'maydi/qisqarib qoladi" bo'lib ko'rinar
// edi (addOrder'dagi bilan AYNAN bir xil klass bug — 2026-08). Bu yerda
// DB'da (`text` ustun) haqiqiy uzunlik cheklovi YO'Q edi — muammo faqat
// shu client arxitekturasida edi.
//
// Tuzatish: LOCAL state'da tahrirlanadi, tarmoqqa FAQAT "Saqlash"
// bosilganda, BITTA so'rov bilan yuboriladi. Bu (a) race'ni butunlay
// yo'qotadi, (b) foydalanuvchiga aniq "saqlanmoqda/saqlandi/xato" holatini
// ko'rsatadi, (c) qayta ochilganda har doim serverdagi HAQIQIY qiymat
// ko'rinadi (local state store.settings o'zgarganda qayta sinxronlanadi).
const CLUB_FIELDS: [keyof typeof CLUB_FIELD_LIMITS, string][] = [
  ["clubName", "Klub nomi"],
  ["address", "Manzil"],
  ["phone", "Telefon"],
  ["workHours", "Ish vaqti"],
  ["telegram", "Telegram"],
  ["instagram", "Instagram"],
];

function ClubTab() {
  const store = useAdminStore();
  const S = store.settings;

  const [form, setForm] = useState({
    clubName: S.clubName,
    address: S.address,
    phone: S.phone,
    workHours: S.workHours,
    telegram: S.telegram,
    instagram: S.instagram,
    info: S.info,
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Server'dan yangi qiymat kelsa (masalan sahifa birinchi ochilganda,
  // yoki boshqa qurilmada o'zgartirilgandan keyin `refresh` qilinsa) —
  // local formani shu bilan sinxronlaymiz. Foydalanuvchi hozir tahrirlab
  // turgan bo'lsa (saveState !== idle/saved emas) qayta bosib yozib
  // yubormaslik uchun faqat "toza" holatda sinxronlaymiz.
  useEffect(() => {
    setForm({
      clubName: S.clubName,
      address: S.address,
      phone: S.phone,
      workHours: S.workHours,
      telegram: S.telegram,
      instagram: S.instagram,
      info: S.info,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.clubName, S.address, S.phone, S.workHours, S.telegram, S.instagram, S.info]);

  const dirty =
    form.clubName !== S.clubName ||
    form.address !== S.address ||
    form.phone !== S.phone ||
    form.workHours !== S.workHours ||
    form.telegram !== S.telegram ||
    form.instagram !== S.instagram ||
    form.info !== S.info;

  const overLimitField = (Object.keys(CLUB_FIELD_LIMITS) as (keyof typeof CLUB_FIELD_LIMITS)[]).find(
    (k) => form[k].length > CLUB_FIELD_LIMITS[k]
  );

  async function handleSave() {
    if (overLimitField) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await store.updateSettings(form);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Saqlashda xatolik");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        {CLUB_FIELDS.map(([key, label]) => (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs text-surfaceMuted-foreground">
              <span>{label}</span>
              <span className={form[key].length > CLUB_FIELD_LIMITS[key] ? "text-destructive" : ""}>
                {form[key].length}/{CLUB_FIELD_LIMITS[key]}
              </span>
            </div>
            <Input value={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
          </div>
        ))}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-surfaceMuted-foreground">
            <span>Klub haqida</span>
            <span className={form.info.length > CLUB_FIELD_LIMITS.info ? "text-destructive" : ""}>
              {form.info.length}/{CLUB_FIELD_LIMITS.info}
            </span>
          </div>
          {/* rows=6 + max-h + overflow-y-auto: uzun matn ekranni cho'zib
              yubormaydi, ichida qulay scroll bilan ko'rinadi — mobil
              (Telegram Web App)da ham barqaror ishlaydi. resize-y admin
              xohlasa balandroq qilib olishiga ruxsat beradi. */}
          <textarea
            value={form.info}
            onChange={(e) => setForm((f) => ({ ...f, info: e.target.value }))}
            rows={6}
            placeholder="Klub haqida bir necha qatorli tavsif yozishingiz mumkin — soatlar, qoidalar, qo'shimcha xizmatlar va h.k."
            className="max-h-80 w-full resize-y overflow-y-auto rounded-card border border-edge bg-cardElevated px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary/50"
          />
          {form.info.length > CLUB_FIELD_LIMITS.info && (
            <div className="mt-1 text-xs text-destructive">
              Matn juda uzun — {CLUB_FIELD_LIMITS.info} belgidan kam qiling ({form.info.length - CLUB_FIELD_LIMITS.info} ortiqcha).
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Btn variant="primary" onClick={handleSave} disabled={!dirty || !!overLimitField || saveState === "saving"}>
            {saveState === "saving" ? "Saqlanmoqda…" : "Saqlash"}
          </Btn>
          {saveState === "saved" && <span className="text-xs font-medium text-success">✓ Saqlandi</span>}
          {saveState === "error" && <span className="text-xs font-medium text-destructive">{saveError}</span>}
          {dirty && saveState === "idle" && (
            <span className="text-xs text-surfaceMuted-foreground">Saqlanmagan o&#39;zgarishlar bor</span>
          )}
        </div>
      </Card>
      <Card padding="none" className="p-0">
        <ToggleRow
          label="💳 Karta to'lovi"
          on={S.cardPaymentEnabled}
          onChange={(v) => store.updateSettings({ cardPaymentEnabled: v })}
        />
      </Card>
    </div>
  );
}

function TelegramTab() {
  const store = useAdminStore();
  const S = store.settings;
  const R = S.debtReminderPolicy;
  const setReminder = (patch: Partial<typeof R>) =>
    store.updateSettings({ debtReminderPolicy: { ...R, ...patch } });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Log kanal" />
        {S.telegramLog.enabled && S.telegramLog.channelId ? (
          <div className="flex items-center justify-between rounded-card border border-success/25 bg-success/30 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-success">✓ Ulangan</div>
              <div className="text-xs text-surfaceMuted-foreground">Kanal ID: {S.telegramLog.channelId}</div>
            </div>
            <Toggle
              on={S.telegramLog.enabled}
              onChange={(v) => store.updateSettings({ telegramLog: { ...S.telegramLog, enabled: v } })}
            />
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-edge px-4 py-4 text-xs leading-relaxed text-surfaceMuted-foreground">
            Hali kanal ulanmagan. Ulash uchun: (1) Telegram&#39;da yopiq kanal yarating, (2) botni kanalga{" "}
            <b className="text-foreground">admin</b> sifatida qo&#39;shing, (3) kanaldagi istalgan xabarni botga
            shaxsiy chatda <b className="text-foreground">forward</b> qiling. Faqat Super Admin&#39;ning
            forward&#39;i qabul qilinadi.
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Qarz eslatmalari" />
        <div className="divide-y divide-edge">
          <ToggleRow
            label="Muddat kuni eslatma"
            on={R.dueDateReminder}
            onChange={(v) => setReminder({ dueDateReminder: v })}
          />
          <ToggleRow
            label="Muddati o'tgan eslatma"
            on={R.overdueReminder}
            onChange={(v) => setReminder({ overdueReminder: v })}
          />
          <NumField
            label="Qayta eslatish oralig'i"
            value={R.overdueRepeatDays}
            onChange={(n) => setReminder({ overdueRepeatDays: n })}
            suffix="kun"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Kunlik hisobot" />
        <div className="divide-y divide-edge">
          <ToggleRow
            label="Yoqilgan"
            on={S.dailyReport.enabled}
            onChange={(v) => store.updateSettings({ dailyReport: { ...S.dailyReport, enabled: v } })}
          />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-surfaceMuted-foreground">Yopilish vaqti (taxminiy)</span>
            <input
              type="time"
              value={S.dailyReport.time}
              onChange={(e) => store.updateSettings({ dailyReport: { ...S.dailyReport, time: e.target.value } })}
              className="rounded-control border border-edge bg-cardElevated px-2.5 py-1.5 text-sm text-foreground"
            />
          </div>
        </div>
        <div className="mt-2 rounded-card border border-primary/20 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-primary">
          Vercel Hobby tarifida cron kuniga faqat bir marta, taxminan yarim
          tunda ishga tushadi — bu vaqt aniq daqiqagacha kafolatlanmaydi.
          Hisobot har doim o&#39;tgan (to&#39;liq tugagan) kun uchun yuboriladi.
        </div>
      </Card>
    </div>
  );
}

function StaffTab() {
  const store = useAdminStore();
  const [name, setName] = useState("");
  const [tgId, setTgId] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("operator");
  const [confirmGrant, setConfirmGrant] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const isSuper = store.currentStaff.role === "super_admin";
  const superCount = store.staff.filter((m) => m.role === "super_admin").length;

  const PERms: Record<StaffRole, string> = {
    super_admin: "To'liq: sozlamalar, hisobotlar, xodimlar, korreksiyalar",
    admin: "Stollar, sessiyalar, zakazlar, mijozlar, to'lovlar",
    operator: "O'yin boshlash/tugatish, zakaz qo'shish",
    cashier: "Hisoblar va to'lovlar",
  };

  return (
    <div>
      {isSuper && (
        <div className="mb-4 rounded-card border border-primary/20 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-primary">
          Siz Super Admin&#39;siz — rol o&#39;zgartirish, xodimga Super Admin huquqi berish/olib
          tashlash va xodim o&#39;chirish shu yerda mavjud. Bir vaqtda bir nechta Super Admin
          bo&#39;lishi mumkin, lekin kamida bittasi doim qolishi shart.
        </div>
      )}
      <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
        {store.staff.map((m) => {
          const isSelf = m.id === store.currentStaff.id;
          return (
            <div key={m.id} className={`px-4 py-3 ${!m.active ? "opacity-45" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {m.name}
                    {isSelf && <span className="ml-1 text-[11px] font-normal text-surfaceMuted-foreground">(siz)</span>}{" "}
                    <span className="text-xs font-normal text-surfaceMuted-foreground">@{m.tgUsername} · ID {m.tgId}</span>
                  </div>
                  <div className="text-xs text-primary">{ROLE_LABELS[m.role]}</div>
                </div>
                {m.role !== "super_admin" && (
                  <Toggle on={m.active} onChange={(v) => store.updateStaff(m.id, { active: v })} />
                )}
              </div>

              {isSuper && m.role !== "super_admin" && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-edge pt-2.5">
                  <select
                    value={m.role}
                    onChange={(e) => store.updateStaff(m.id, { role: e.target.value as StaffRole })}
                    className="rounded-control border border-edge bg-cardElevated px-2.5 py-1.5 text-xs text-foreground"
                  >
                    {(["admin", "operator", "cashier"] as StaffRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>

                  {confirmGrant === m.id ? (
                    <>
                      <button
                        onClick={() => {
                          store.grantSuperAdmin(m.id);
                          setConfirmGrant(null);
                        }}
                        className="rounded-control bg-primary px-2.5 py-1.5 text-xs font-bold text-dark"
                      >
                        Tasdiqlash: Super qilish
                      </button>
                      <button
                        onClick={() => setConfirmGrant(null)}
                        className="rounded-control bg-cardElevated px-2.5 py-1.5 text-xs text-foreground/70"
                      >
                        Bekor
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmGrant(m.id)}
                      className="rounded-control border border-primary/25 px-2.5 py-1.5 text-xs font-medium text-primary/90"
                    >
                      Super qilish
                    </button>
                  )}

                  {confirmRemove === m.id ? (
                    <>
                      <button
                        onClick={() => {
                          store.removeStaff(m.id);
                          setConfirmRemove(null);
                        }}
                        className="rounded-control bg-destructive px-2.5 py-1.5 text-xs font-bold text-dark"
                      >
                        Tasdiqlash: O&#39;chirish
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="rounded-control bg-cardElevated px-2.5 py-1.5 text-xs text-foreground/70"
                      >
                        Bekor
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(m.id)}
                      disabled={isSelf}
                      className="rounded-control bg-cardElevated px-2.5 py-1.5 text-xs text-destructive/80 disabled:opacity-30"
                    >
                      🗑 O&#39;chirish
                    </button>
                  )}
                </div>
              )}

              {isSuper && m.role === "super_admin" && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-edge pt-2.5">
                  {superCount <= 1 ? (
                    <span className="text-[11px] text-surfaceMuted-foreground">
                      Oxirgi Super Admin — kamida bittasi qolishi shart.
                    </span>
                  ) : confirmRevoke === m.id ? (
                    <>
                      <button
                        onClick={() => {
                          store.revokeSuperAdmin(m.id);
                          setConfirmRevoke(null);
                        }}
                        className="rounded-control bg-destructive px-2.5 py-1.5 text-xs font-bold text-dark"
                      >
                        Tasdiqlash: Admin darajasiga tushirish
                      </button>
                      <button
                        onClick={() => setConfirmRevoke(null)}
                        className="rounded-control bg-cardElevated px-2.5 py-1.5 text-xs text-foreground/70"
                      >
                        Bekor
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmRevoke(m.id)}
                      className="rounded-control border border-edge px-2.5 py-1.5 text-xs font-medium text-foreground/70"
                    >
                      Admin darajasiga tushirish
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <SectionTitle>Yangi xodim (Telegram orqali)</SectionTitle>
      <Card className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={setName} placeholder="Ismi" />
        <Input value={username} onChange={setUsername} placeholder="@username" />
        <Input
          value={tgId}
          onChange={(v) => setTgId(v.replace(/[^0-9]/g, ""))}
          placeholder="Telegram ID (raqamli)"
          className="col-span-2"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          className="col-span-2 rounded-control border border-edge bg-cardElevated px-3 py-3 text-sm text-foreground"
        >
          {(["admin", "operator", "cashier"] as StaffRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]} — {PERms[r]}
            </option>
          ))}
        </select>
        <Btn
          variant="primary"
          className="col-span-2"
          disabled={!name || !username || !tgId}
          onClick={() => {
            store.addStaff(name, tgId, username.replace("@", ""), role);
            setName("");
            setUsername("");
            setTgId("");
          }}
        >
          + Qo&#39;shish
        </Btn>
      </Card>
      <div className="mt-2 text-[11px] leading-relaxed text-surfaceMuted-foreground">
        Telegram ID xodimning o&#39;zi @userinfobot&#39;ga yozib olishi mumkin. Parol kerak
        emas — kirishda shu raqamli ID orqali aniqlanadi.
      </div>
    </div>
  );
}

function AuditTab() {
  const store = useAdminStore();
  const entries = store.audit.slice(0, 50);
  return (
    <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyState icon="📜" title="Hali audit yozuvi yo'q" />
        </div>
      ) : (
        entries.map((a) => (
          <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
            <span className="tabular mt-0.5 text-xs text-surfaceMuted-foreground">{fmtHM(a.at)}</span>
            <div className="text-sm">
              <span className="font-semibold text-foreground">{a.staffName}</span>{" "}
              <span className="text-[11px] text-primary">({ROLE_LABELS[a.role]})</span>
              <div className="text-xs text-surfaceMuted-foreground">{a.action}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
