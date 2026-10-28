"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCajasBancos } from "@/components/cajas-bancos/cajas-bancos-provider";
import {
  ConciliacionActa,
  type ConciliacionActaData,
} from "@/components/cajas-bancos/conciliacion-acta";
import type { Payment } from "@/components/pagos/types";
import { getCashAccountStatement, getCashPosition } from "@/lib/caja/caja";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import {
  computeReconciliation,
  getReconciliation,
  ITEM_META,
  RECONCILIATION_ITEM_KINDS,
  saveReconciliation,
  type ReconciliationItemKind,
} from "@/lib/caja/conciliacion";
import { getMonthRange } from "@/lib/caja/dashboard";
import { addDays } from "@/lib/caja/periodo";
import { reconciliationFormSchema } from "@/lib/schemas/reconciliation";
import { cn, formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

interface DraftItem {
  key: string;
  kind: ReconciliationItemKind;
  description: string;
  amount: string;
}

const EMPTY_FORM = {
  statementBalance: "0",
  preparedBy: "",
  reviewedBy: "",
  notes: "",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación. Intenta nuevamente.";
}

/** Mes anterior completo (primer y último día). */
function previousMonthRange(today: string): { start: string; end: string } {
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  return getMonthRange(addDays(firstOfMonth, -1));
}

function toMoney(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ConciliacionView() {
  const { accounts } = useCajasBancos();
  const [today] = useState(() => getTodayLocalDate());
  const currentMonth = useMemo(() => getMonthRange(today), [today]);
  const nextKey = useRef(0);

  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(currentMonth.start);
  const [to, setTo] = useState(currentMonth.end);
  const [statementBalance, setStatementBalance] = useState(
    EMPTY_FORM.statementBalance
  );
  const [preparedBy, setPreparedBy] = useState(EMPTY_FORM.preparedBy);
  const [reviewedBy, setReviewedBy] = useState(EMPTY_FORM.reviewedBy);
  const [notes, setNotes] = useState(EMPTY_FORM.notes);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [booksBalance, setBooksBalance] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingBooks, setIsRefreshingBooks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actaOpen, setActaOpen] = useState(false);

  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.isActive && account.type === "BANK_ACCOUNT"
      ),
    [accounts]
  );
  const account =
    bankAccounts.find((item) => item.id === accountId) ??
    bankAccounts[0] ??
    null;
  const currency = account?.currency === "USD" ? "USD" : "PEN";

  const createDraft = useCallback(    (values: Partial<Omit<DraftItem, "key">> = {}): DraftItem => {
      nextKey.current += 1;
      return {
        key: `draft-${nextKey.current}`,
        kind: values.kind ?? "DEPOSITO_EN_TRANSITO",
        description: values.description ?? "",
        amount: values.amount ?? "",
      };
    },
    []
  );

  const load = useCallback(async () => {
    if (!account) {
      return;
    }

    setIsLoading(true);

    try {
      const [saved, position, statement] = await Promise.all([
        getReconciliation(account.id, from, to),
        getCashPosition(account.id, to),
        getCashAccountStatement(account.id, from, to),
      ]);

      if (saved) {
        setStatementBalance(String(saved.statementBalance));
        setPreparedBy(saved.preparedBy ?? "");
        setReviewedBy(saved.reviewedBy ?? "");
        setNotes(saved.notes ?? "");
        setItems(
          saved.items.map((item) =>
            createDraft({
              kind: item.kind,
              description: item.description,
              amount: String(item.amount),
            })
          )
        );
        setBooksBalance(saved.booksBalance);
      } else {
        setStatementBalance(EMPTY_FORM.statementBalance);
        setPreparedBy(EMPTY_FORM.preparedBy);
        setReviewedBy(EMPTY_FORM.reviewedBy);
        setNotes(EMPTY_FORM.notes);
        setItems([]);
        setBooksBalance(position);
      }

      setSuggestions(
        statement.filter((row) => row.status === "EN_REVISION")
      );
      setLoadError(null);
      setFormError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [account, from, to, createDraft]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const summary = useMemo(
    () =>
      computeReconciliation(
        toMoney(statementBalance),
        booksBalance ?? 0,
        items.map((item) => ({
          kind: item.kind,
          description: item.description,
          amount: toMoney(item.amount),
        }))
      ),
    [statementBalance, booksBalance, items]
  );

  const rangeIsInverted = from > to;
  const closeActa = useCallback(() => setActaOpen(false), []);

  function updateItem(key: string, changes: Partial<Omit<DraftItem, "key">>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item))
    );
  }

  function addItem() {
    setItems((current) => [...current, createDraft()]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function addSuggestion(payment: Payment) {
    setItems((current) => [
      ...current,
      createDraft({
        kind:
          payment.direction === "INGRESO"
            ? "DEPOSITO_EN_TRANSITO"
            : "PAGO_NO_DEBITADO",
        description: `${payment.direction === "INGRESO" ? "Recibo" : "Pago"} ${
          payment.receiptNumber
        }`,
        amount: String(payment.amount),
      }),
    ]);
    setSuggestions((current) =>
      current.filter((row) => row.id !== payment.id)
    );
  }

  async function handleRefreshBooks() {
    if (!account) {
      return;
    }

    setIsRefreshingBooks(true);

    try {
      const position = await getCashPosition(account.id, to);
      setBooksBalance(position);
      toast.success("Saldo según registros actualizado");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsRefreshingBooks(false);
    }
  }

  async function handleSave() {
    if (!account) {
      return;
    }

    const parsed = reconciliationFormSchema.safeParse({
      statementBalance,
      preparedBy,
      reviewedBy,
      notes,
      items: items.map((item) => ({
        kind: item.kind,
        description: item.description,
        amount: item.amount,
      })),
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const saved = await saveReconciliation({
        accountId: account.id,
        periodStart: from,
        periodEnd: to,
        statementBalance: parsed.data.statementBalance,
        booksBalance: booksBalance ?? 0,
        preparedBy: parsed.data.preparedBy || null,
        reviewedBy: parsed.data.reviewedBy || null,
        notes: parsed.data.notes || null,
        items: parsed.data.items,
      });

      setStatementBalance(String(saved.statementBalance));
      setBooksBalance(saved.booksBalance);
      setPreparedBy(saved.preparedBy ?? "");
      setReviewedBy(saved.reviewedBy ?? "");
      setNotes(saved.notes ?? "");
      setItems(
        saved.items.map((item) =>
          createDraft({
            kind: item.kind,
            description: item.description,
            amount: String(item.amount),
          })
        )
      );
      toast.success("Conciliación guardada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleExport() {
    if (!account) {
      return;
    }

    const rows: (string | number | null)[][] = [
      ["Conciliación bancaria"],
      ["Banco", account.bankName ?? ""],
      ["Cuenta", account.name],
      ["Moneda", currency],
      ["Período", `${from} a ${to}`],
      [],
      ["Signo", "Clase", "Descripción", "Monto"],
      ...items.map((item) => [
        ITEM_META[item.kind].sign,
        ITEM_META[item.kind].longLabel,
        item.description,
        toMoney(item.amount),
      ]),
      [],
      ["", "", "Saldo según extracto", toMoney(statementBalance)],
      ["", "", "Saldo conciliado", summary.reconciledBalance],
      ["", "", "Saldo según registros", booksBalance ?? 0],
      ["", "", "Diferencia", summary.difference],
    ];

    downloadCsv(
      `conciliacion-${account.name}-${from}_${to}.csv`,
      toCsv(rows)
    );
  }

  const actaData: ConciliacionActaData | null = account
    ? {
        accountName: account.name,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        currency,
        periodStart: from,
        periodEnd: to,
        statementBalance: toMoney(statementBalance),
        booksBalance: booksBalance ?? 0,
        preparedBy: preparedBy || null,
        reviewedBy: reviewedBy || null,
        notes: notes || null,
        items: items.map((item) => ({
          kind: item.kind,
          description: item.description,
          amount: toMoney(item.amount),
        })),
      }
    : null;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Conciliación bancaria</h1>
        <p className="text-sm text-muted-foreground">
          Compara lo que dice tu extracto con lo que tienes registrado y explica
          la diferencia.
        </p>
      </div>

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Registra una cuenta bancaria en Configuración para empezar. Las cajas
          de efectivo se controlan con arqueos y cierres.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-full flex-col gap-1.5 sm:w-64">
              <Label htmlFor="reconciliation-account">Cuenta bancaria</Label>
              <Select
                value={account?.id ?? null}
                items={bankAccounts.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.currency}`,
                }))}
                onValueChange={(value) => setAccountId(value ?? "")}
              >
                <SelectTrigger id="reconciliation-account" className="w-full">
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reconciliation-from">Desde</Label>
              <Input
                id="reconciliation-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reconciliation-to">Hasta</Label>
              <Input
                id="reconciliation-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-40"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setFrom(currentMonth.start);
                setTo(currentMonth.end);
              }}
            >
              Este mes
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const previous = previousMonthRange(today);
                setFrom(previous.start);
                setTo(previous.end);
              }}
            >
              Mes anterior
            </Button>
          </div>

          {rangeIsInverted ? (
            <p role="alert" className="text-sm text-destructive">
              La fecha «Desde» no puede ser posterior a «Hasta».
            </p>
          ) : null}

          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Cargando la conciliación…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card className="bg-muted/30 ring-0">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Saldo según extracto bancario
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Input
                      id="reconciliation-statement"
                      aria-label="Saldo según extracto bancario"
                      inputMode="decimal"
                      value={statementBalance}
                      onChange={(event) =>
                        setStatementBalance(event.target.value)
                      }
                      className="h-14 text-2xl font-semibold tabular-nums"
                    />
                    <p className="text-xs text-muted-foreground">
                      Abre la app de tu banco y copia el saldo final del período.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30 ring-0">
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Saldo según mis registros
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshBooks}
                      disabled={isRefreshingBooks}
                    >
                      <RefreshCw
                        className={cn(isRefreshingBooks && "animate-spin")}
                      />
                      Actualizar libros
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <p className="text-2xl font-semibold tabular-nums">
                      {booksBalance === null
                        ? "—"
                        : formatCurrency(booksBalance, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Lo que el sistema tiene registrado al {formatDate(to)}.
                      Actualízalo si registraste movimientos nuevos.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    Partidas que explican la diferencia
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Solo lo que ya pasó en un lado y todavía no en el otro.
                  </p>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin partidas: el extracto y tus registros deberían coincidir.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item, index) => {
                      const meta = ITEM_META[item.kind];

                      return (
                        <div
                          key={item.key}
                          className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-start"
                        >
                          <div className="flex flex-col gap-1.5">
                            <Label
                              htmlFor={`reconciliation-kind-${item.key}`}
                              className="text-xs text-muted-foreground"
                            >
                              Clase
                            </Label>
                            <Select
                              value={item.kind}
                              items={RECONCILIATION_ITEM_KINDS.map((kind) => ({
                                value: kind,
                                label: `${ITEM_META[kind].sign} ${ITEM_META[kind].label}`,
                              }))}
                              onValueChange={(value) => {
                                if (value) {
                                  updateItem(item.key, {
                                    kind: value as ReconciliationItemKind,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`reconciliation-kind-${item.key}`}
                                aria-label={`Clase de la partida ${index + 1}`}
                                className="w-full sm:w-56"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RECONCILIATION_ITEM_KINDS.map((kind) => (
                                  <SelectItem key={kind} value={kind}>
                                    {ITEM_META[kind].sign}{" "}
                                    {ITEM_META[kind].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label
                              htmlFor={`reconciliation-description-${item.key}`}
                              className="text-xs text-muted-foreground"
                            >
                              Descripción
                            </Label>
                            <Input
                              id={`reconciliation-description-${item.key}`}
                              aria-label={`Descripción de la partida ${index + 1}`}
                              value={item.description}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  description: event.target.value,
                                })
                              }
                              placeholder="Ej.: depósito del 30/10"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label
                              htmlFor={`reconciliation-amount-${item.key}`}
                              className="text-xs text-muted-foreground"
                            >
                              Monto ({meta.sign})
                            </Label>
                            <Input
                              id={`reconciliation-amount-${item.key}`}
                              aria-label={`Monto de la partida ${index + 1}`}
                              inputMode="decimal"
                              value={item.amount}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  amount: event.target.value,
                                })
                              }
                              className="text-right tabular-nums"
                            />
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar partida ${index + 1}`}
                            onClick={() => removeItem(item.key)}
                            className="sm:mt-6"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={addItem}>
                    <Plus />
                    Agregar partida
                  </Button>
                  {items.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {items.length}{" "}
                      {items.length === 1 ? "partida" : "partidas"} ·{" "}
                      {ITEM_META[items[0].kind].sign} indica si suma o resta al
                      extracto.
                    </p>
                  ) : null}
                </div>

                {suggestions.length > 0 ? (
                  <div className="rounded-lg border border-dashed p-3">
                    <p className="text-sm font-medium">
                      Recibos sin verificar en el período
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Son una pista, no se suman solos: agrégalos solo si el
                      banco todavía no los muestra.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.map((payment) => (
                        <Button
                          key={payment.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => addSuggestion(payment)}
                          aria-label={`Agregar ${payment.receiptNumber} como partida`}
                        >
                          <Plus />
                          {payment.receiptNumber} ·{" "}
                          {formatCurrency(payment.amount, currency)} ·{" "}
                          {formatDate(payment.paymentDate)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <Card
                className={cn(
                  "ring-0",
                  summary.isConciled
                    ? "bg-muted/30"
                    : "border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20"
                )}
              >
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      Saldo conciliado (extracto ± partidas)
                    </span>
                    <span className="text-xl font-semibold tabular-nums">
                      {formatCurrency(summary.reconciledBalance, currency)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Diferencia</span>
                      {summary.isConciled ? (
                        <Badge variant="secondary">Conciliado</Badge>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        !summary.isConciled &&
                          "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {formatCurrency(summary.difference, currency)}
                    </span>
                  </div>

                  {!summary.isConciled ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      Hay una diferencia por encontrar: revisa si falta registrar
                      un cargo o abono del banco, o si un monto está mal escrito.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="bg-muted/30 ring-0">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Firmas y notas del acta
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reconciliation-prepared-by">
                      Elaborado por
                    </Label>
                    <Input
                      id="reconciliation-prepared-by"
                      value={preparedBy}
                      onChange={(event) => setPreparedBy(event.target.value)}
                      maxLength={100}
                      placeholder="Nombre de quien concilia"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reconciliation-reviewed-by">
                      Revisado por
                    </Label>
                    <Input
                      id="reconciliation-reviewed-by"
                      value={reviewedBy}
                      onChange={(event) => setReviewedBy(event.target.value)}
                      maxLength={100}
                      placeholder="Nombre de quien revisa"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <Label htmlFor="reconciliation-notes">Notas</Label>
                    <Textarea
                      id="reconciliation-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={500}
                      placeholder="Observaciones para el archivo"
                    />
                  </div>
                </CardContent>
              </Card>

              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Guardando…" : "Guardar conciliación"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setActaOpen(true)}
                  disabled={!actaData}
                >
                  <Printer />
                  Imprimir acta
                </Button>
                <Button variant="outline" onClick={handleExport}>
                  <Download />
                  Descargar CSV (se abre en Excel)
                </Button>
              </div>

              {actaData ? (
                <ConciliacionActa
                  data={actaData}
                  open={actaOpen}
                  onClose={closeActa}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}
