"use client";

import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEvent,
} from "react";

import {
  addAssignment,
  addItem,
  addParticipant,
  calculateRoom,
  type CalculateResponse,
  deleteAssignment,
  deleteItem,
  deleteParticipant,
  getRoom,
  type ItemAssignment,
  joinRoom,
  type Participant,
  type ReceiptItem,
  type Room,
  selectItem,
  unselectItem,
  updateItem,
  updateParticipant,
  updateRoom,
} from "../../../lib/api";
import { calculateParticipantPreview } from "../../../lib/local-calculation";
import { formatMoney, tryParseMoneyToMinorUnits } from "../../../lib/money";
import {
  clearAdminToken,
  clearParticipantSession,
  loadAdminToken,
  loadParticipantSession,
  saveParticipantSession,
  type ParticipantSession,
} from "../../../lib/session";

type Props = {
  params: Promise<{
    roomId: string;
  }>;
};

export default function RoomPage({ params }: Props) {
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [assignments, setAssignments] = useState<ItemAssignment[]>([]);
  const [calculation, setCalculation] = useState<CalculateResponse | null>(
    null,
  );

  const [adminToken, setAdminToken] = useState("");
  const [participantSession, setParticipantSession] =
    useState<ParticipantSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [joinName, setJoinName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemPrice, setItemPrice] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [weight, setWeight] = useState("1");
  const [serviceFee, setServiceFee] = useState("0");
  const [tipAmount, setTipAmount] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [expectedTotal, setExpectedTotal] = useState("0");
  const [payerParticipantId, setPayerParticipantId] = useState("");

  const [shareUrl, setShareUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copyState, setCopyState] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectionLoadingId, setSelectionLoadingId] = useState("");

  const loadRoomData = useCallback(
    async (id: string, syncForm: boolean, silent = false) => {
      if (!silent) {
        setError("");
      }

      try {
        const data = await getRoom(id);
        const nextParticipants = data.participants ?? [];
        const nextItems = data.items ?? [];
        const nextAssignments = data.assignments ?? [];

        setRoom(data.room);
        setParticipants(nextParticipants);
        setItems(nextItems);
        setAssignments(nextAssignments);
        setLastUpdatedAt(new Date());

        setSelectedItemId((current) =>
          nextItems.some((item) => item.id === current)
            ? current
            : (nextItems[0]?.id ?? ""),
        );

        setSelectedParticipantId((current) =>
          nextParticipants.some((participant) => participant.id === current)
            ? current
            : (nextParticipants[0]?.id ?? ""),
        );

        if (syncForm) {
          setServiceFee(String(data.room.service_fee / 100));
          setTipAmount(String(data.room.tip_amount / 100));
          setDiscount(String(data.room.discount / 100));
          setExpectedTotal(String(data.room.expected_total / 100));
          setPayerParticipantId(data.room.payer_participant_id ?? "");
        }
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Ошибка загрузки комнаты",
          );
        }
      }
    },
    [],
  );

  useEffect(() => {
    params.then((resolved) => {
      const id = resolved.roomId;

      setRoomId(id);
      setAdminToken(loadAdminToken(id));
      setParticipantSession(loadParticipantSession(id));
      setShareUrl(`${window.location.origin}/rooms/${id}`);
      setAuthReady(true);
    });
  }, [params]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    void loadRoomData(roomId, true);
  }, [loadRoomData, roomId]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadRoomData(roomId, false, true);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadRoomData, roomId]);

  useEffect(() => {
    if (!shareUrl) {
      return;
    }

    let cancelled = false;

    QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) {
          setQrCodeUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrCodeUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  useEffect(() => {
    if (
      !room ||
      !participantSession ||
      participants.some(
        (participant) => participant.id === participantSession.participantId,
      )
    ) {
      return;
    }

    clearParticipantSession(room.id);
    setParticipantSession(null);
    setError(
      "Участник был удалён из комнаты. Войдите снова под другим именем.",
    );
  }, [participantSession, participants, room]);

  async function runAdminMutation(
    action: () => Promise<unknown>,
  ): Promise<boolean> {
    if (!roomId || !adminToken) {
      setError("В этом браузере нет ключа организатора.");
      return false;
    }

    setLoading(true);
    setError("");

    try {
      await action();
      await loadRoomData(roomId, false);
      setCalculation(null);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка выполнения операции";

      setError(message);

      if (message === "organizer access required") {
        clearAdminToken(roomId);
        setAdminToken("");
      }

      return false;
    } finally {
      setLoading(false);
    }
  }

  function parseRequiredMoney(value: string, fieldName: string): number | null {
    const parsed = tryParseMoneyToMinorUnits(value);

    if (parsed === null) {
      setError(`Поле «${fieldName}» должно содержать число`);
      return null;
    }

    return parsed;
  }

  async function handleJoin(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = joinName.trim();
    if (!roomId || !name) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await joinRoom(roomId, {
        name,
      });

      const session: ParticipantSession = {
        participantId: result.participant.id,
        participantToken: result.participant_token,
        name: result.participant.name,
      };

      saveParticipantSession(roomId, session);
      setParticipantSession(session);
      setJoinName("");
      await loadRoomData(roomId, false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось войти в комнату",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSelection(item: ReceiptItem) {
    if (!participantSession || !roomId) {
      return;
    }

    const selected = assignments.some(
      (assignment) =>
        assignment.item_id === item.id &&
        assignment.participant_id === participantSession.participantId,
    );

    setSelectionLoadingId(item.id);
    setError("");

    try {
      if (selected) {
        await unselectItem(
          roomId,
          item.id,
          participantSession.participantToken,
        );
      } else {
        await selectItem(roomId, item.id, participantSession.participantToken);
      }

      await loadRoomData(roomId, false);
      setCalculation(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось изменить выбор";

      setError(message);

      if (message === "participant session is invalid") {
        clearParticipantSession(roomId);
        setParticipantSession(null);
      }
    } finally {
      setSelectionLoadingId("");
    }
  }

  function handleLeaveParticipantMode() {
    if (!roomId) {
      return;
    }

    clearParticipantSession(roomId);
    setParticipantSession(null);
    setError("");
  }

  async function handleCopyLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("Ссылка скопирована");
    } catch {
      setCopyState("Не удалось скопировать автоматически");
    }

    window.setTimeout(() => setCopyState(""), 2500);
  }

  async function handleShareLink() {
    if (!shareUrl || !room) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: room.title,
          text: "Отметь свои позиции в общем чеке",
          url: shareUrl,
        });
        return;
      } catch {
        return;
      }
    }

    await handleCopyLink();
  }

  async function handleUpdateCharges(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedServiceFee = parseRequiredMoney(serviceFee, "Сервисный сбор");
    const parsedTipAmount = parseRequiredMoney(tipAmount, "Чаевые");
    const parsedDiscount = parseRequiredMoney(discount, "Скидка");
    const parsedExpectedTotal = parseRequiredMoney(
      expectedTotal,
      "Итог по чеку",
    );

    if (
      parsedServiceFee === null ||
      parsedTipAmount === null ||
      parsedDiscount === null ||
      parsedExpectedTotal === null
    ) {
      return;
    }

    if (
      parsedServiceFee < 0 ||
      parsedTipAmount < 0 ||
      parsedDiscount < 0 ||
      parsedExpectedTotal < 0
    ) {
      setError("Дополнительные суммы не могут быть отрицательными");
      return;
    }

    await runAdminMutation(() =>
      updateRoom(roomId, adminToken, {
        service_fee: parsedServiceFee,
        tip_amount: parsedTipAmount,
        discount: parsedDiscount,
        expected_total: parsedExpectedTotal,
        payer_participant_id: payerParticipantId,
      }),
    );
  }

  async function handleAddParticipant(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = participantName.trim();
    if (!name) {
      return;
    }

    const success = await runAdminMutation(() =>
      addParticipant(roomId, adminToken, { name }),
    );

    if (success) {
      setParticipantName("");
    }
  }

  async function handleEditParticipant(participant: Participant) {
    const name = window.prompt("Новое имя участника", participant.name);

    if (name === null) {
      return;
    }

    if (!name.trim()) {
      setError("Имя участника не может быть пустым");
      return;
    }

    await runAdminMutation(() =>
      updateParticipant(roomId, participant.id, adminToken, {
        name: name.trim(),
      }),
    );
  }

  async function handleDeleteParticipant(participant: Participant) {
    const confirmed = window.confirm(
      `Удалить участника «${participant.name}»? Его отметки на блюдах также будут удалены.`,
    );

    if (!confirmed) {
      return;
    }

    await runAdminMutation(() =>
      deleteParticipant(roomId, participant.id, adminToken),
    );
  }

  async function handleAddItem(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(itemQuantity);
    const unitPrice = parseRequiredMoney(itemPrice, "Цена за штуку");

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Количество должно быть положительным целым числом");
      return;
    }

    if (unitPrice === null || unitPrice <= 0) {
      setError("Цена должна быть больше 0");
      return;
    }

    if (!itemName.trim()) {
      return;
    }

    const success = await runAdminMutation(() =>
      addItem(roomId, adminToken, {
        name: itemName.trim(),
        quantity,
        unit_price: unitPrice,
      }),
    );

    if (success) {
      setItemName("");
      setItemQuantity("1");
      setItemPrice("");
    }
  }

  async function handleEditItem(item: ReceiptItem) {
    const name = window.prompt("Название позиции", item.name);
    if (name === null) {
      return;
    }

    const quantityText = window.prompt("Количество", String(item.quantity));
    if (quantityText === null) {
      return;
    }

    const priceText = window.prompt(
      "Цена за штуку",
      String(item.unit_price / 100),
    );
    if (priceText === null) {
      return;
    }

    const quantity = Number(quantityText);
    const unitPrice = tryParseMoneyToMinorUnits(priceText);

    if (!name.trim()) {
      setError("Название позиции не может быть пустым");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Количество должно быть положительным целым числом");
      return;
    }
    if (unitPrice === null || unitPrice <= 0) {
      setError("Цена должна быть больше 0");
      return;
    }

    await runAdminMutation(() =>
      updateItem(roomId, item.id, adminToken, {
        name: name.trim(),
        quantity,
        unit_price: unitPrice,
      }),
    );
  }

  async function handleDeleteItem(item: ReceiptItem) {
    const confirmed = window.confirm(
      `Удалить позицию «${item.name}»? Все её отметки также будут удалены.`,
    );

    if (!confirmed) {
      return;
    }

    await runAdminMutation(() => deleteItem(roomId, item.id, adminToken));
  }

  async function handleAddAssignment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericWeight = Number(weight);
    if (!Number.isInteger(numericWeight) || numericWeight <= 0) {
      setError("Вес должен быть положительным целым числом");
      return;
    }

    if (!selectedItemId || !selectedParticipantId) {
      return;
    }

    await runAdminMutation(() =>
      addAssignment(roomId, adminToken, {
        item_id: selectedItemId,
        participant_id: selectedParticipantId,
        weight: numericWeight,
      }),
    );
  }

  async function handleDeleteAssignment(assignment: ItemAssignment) {
    await runAdminMutation(() =>
      deleteAssignment(
        roomId,
        assignment.item_id,
        assignment.participant_id,
        adminToken,
      ),
    );
  }

  async function handleCalculate() {
    if (!roomId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      setCalculation(await calculateRoom(roomId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка расчёта");
    } finally {
      setLoading(false);
    }
  }

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.total, 0),
    [items],
  );

  const assignmentRows = useMemo(
    () =>
      assignments.map((assignment) => {
        const item = items.find((value) => value.id === assignment.item_id);
        const participant = participants.find(
          (value) => value.id === assignment.participant_id,
        );

        return {
          ...assignment,
          itemName: item?.name ?? assignment.item_id,
          participantName: participant?.name ?? assignment.participant_id,
        };
      }),
    [assignments, items, participants],
  );

  const unassignedItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !assignments.some((assignment) => assignment.item_id === item.id),
      ),
    [assignments, items],
  );

  const payer = useMemo(
    () =>
      participants.find(
        (participant) => participant.id === room?.payer_participant_id,
      ) ?? null,
    [participants, room],
  );

  const currentParticipant = useMemo(
    () =>
      participants.find(
        (participant) => participant.id === participantSession?.participantId,
      ) ?? null,
    [participantSession, participants],
  );

  const participantPreview = useMemo(() => {
    if (!room || !participantSession) {
      return null;
    }

    return calculateParticipantPreview(
      room,
      participants,
      items,
      assignments,
      participantSession.participantId,
    );
  }, [assignments, items, participantSession, participants, room]);

  if (!authReady || !room) {
    return (
      <main>
        <h1>Комната счёта</h1>
        {error ? <p className="error">{error}</p> : <p>Загрузка...</p>}
      </main>
    );
  }

  if (adminToken) {
    return (
      <main>
        <RoomHeader
          room={room}
          role="Организатор"
          lastUpdatedAt={lastUpdatedAt}
        />

        {error && <p className="error notice">{error}</p>}

        <section className="card share-card">
          <div>
            <p className="eyebrow">Приглашение участников</p>
            <h2>Отправьте эту ссылку</h2>
            <p className="muted">
              В другом браузере откроется простой экран входа и выбора блюд.
              Ключ организатора в ссылку не включается.
            </p>

            <div className="share-line">
              <input readOnly value={shareUrl} aria-label="Ссылка на комнату" />
              <button type="button" onClick={handleCopyLink}>
                Копировать
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleShareLink}
              >
                Поделиться
              </button>
            </div>

            {copyState && <p className="success">{copyState}</p>}
          </div>

          {qrCodeUrl && (
            <img
              className="qr-code"
              src={qrCodeUrl}
              alt="QR-код ссылки на комнату"
              width={220}
              height={220}
            />
          )}
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Настройки счёта</p>
              <h2>Суммы и плательщик</h2>
            </div>

            <p className="metric">
              Позиции: {formatMoney(subtotal, room.currency)}
            </p>
          </div>

          <form onSubmit={handleUpdateCharges} className="grid grid-5">
            <label>
              Итог на чеке
              <input
                type="number"
                min="0"
                step="0.01"
                value={expectedTotal}
                onChange={(event) => setExpectedTotal(event.target.value)}
              />
            </label>

            <label>
              Сервисный сбор
              <input
                type="number"
                min="0"
                step="0.01"
                value={serviceFee}
                onChange={(event) => setServiceFee(event.target.value)}
              />
            </label>

            <label>
              Чаевые
              <input
                type="number"
                min="0"
                step="0.01"
                value={tipAmount}
                onChange={(event) => setTipAmount(event.target.value)}
              />
            </label>

            <label>
              Скидка
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>

            <label>
              Кто оплатил чек
              <select
                value={payerParticipantId}
                onChange={(event) => setPayerParticipantId(event.target.value)}
              >
                <option value="">Не выбран</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </label>

            <button disabled={loading}>Сохранить настройки</button>
          </form>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Люди в комнате</p>
              <h2>Участники</h2>
            </div>
            <span className="count-badge">{participants.length}</span>
          </div>

          <form onSubmit={handleAddParticipant} className="grid grid-2">
            <label>
              Имя участника
              <input
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                placeholder="Аня"
                maxLength={80}
              />
            </label>

            <button disabled={loading || !participantName.trim()}>
              Добавить заранее
            </button>
          </form>

          {participants.length === 0 ? (
            <p className="muted empty-state">
              Участники могут появиться сами, когда откроют ссылку и введут имя.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Статус</th>
                    <th>Роль в счёте</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => (
                    <tr key={participant.id}>
                      <td>{participant.name}</td>
                      <td>
                        <span
                          className={
                            participant.claimed
                              ? "status-pill success-pill"
                              : "status-pill"
                          }
                        >
                          {participant.claimed ? "Вошёл" : "Ожидает входа"}
                        </span>
                      </td>
                      <td>
                        {room.payer_participant_id === participant.id
                          ? "Оплатил чек"
                          : "Участник"}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={loading}
                            onClick={() => handleEditParticipant(participant)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={loading}
                            onClick={() => handleDeleteParticipant(participant)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Содержимое чека</p>
              <h2>Позиции</h2>
            </div>
            <span className="count-badge">{items.length}</span>
          </div>

          <form onSubmit={handleAddItem} className="grid grid-3">
            <label>
              Название
              <input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Пицца"
                maxLength={160}
              />
            </label>

            <label>
              Количество
              <input
                type="number"
                min="1"
                step="1"
                value={itemQuantity}
                onChange={(event) => setItemQuantity(event.target.value)}
              />
            </label>

            <label>
              Цена за штуку
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={itemPrice}
                onChange={(event) => setItemPrice(event.target.value)}
                placeholder="12.50"
              />
            </label>

            <button disabled={loading || !itemName.trim()}>
              Добавить позицию
            </button>
          </form>

          {items.length === 0 ? (
            <p className="muted empty-state">
              Добавьте позиции из бумажного чека.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Кол-во</th>
                    <th>Цена</th>
                    <th>Итого</th>
                    <th>Выбрали</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const selectedCount = assignments.filter(
                      (assignment) => assignment.item_id === item.id,
                    ).length;

                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>{formatMoney(item.unit_price, room.currency)}</td>
                        <td>{formatMoney(item.total, room.currency)}</td>
                        <td>
                          {selectedCount > 0 ? (
                            <span className="status-pill success-pill">
                              {selectedCount}
                            </span>
                          ) : (
                            <span className="status-pill warning-pill">
                              Никто
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={loading}
                              onClick={() => handleEditItem(item)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={loading}
                              onClick={() => handleDeleteItem(item)}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ручная корректировка</p>
              <h2>Распределение</h2>
            </div>
            {unassignedItems.length > 0 && (
              <span className="status-pill warning-pill">
                Не распределено: {unassignedItems.length}
              </span>
            )}
          </div>

          <form onSubmit={handleAddAssignment} className="grid grid-3">
            <label>
              Позиция
              <select
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
              >
                <option value="">Выберите позицию</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {formatMoney(item.total, room.currency)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Участник
              <select
                value={selectedParticipantId}
                onChange={(event) =>
                  setSelectedParticipantId(event.target.value)
                }
              >
                <option value="">Выберите участника</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Вес доли
              <input
                type="number"
                min="1"
                step="1"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </label>

            <button
              disabled={loading || !selectedItemId || !selectedParticipantId}
            >
              Назначить вручную
            </button>
          </form>

          {assignmentRows.length === 0 ? (
            <p className="muted empty-state">Пока никто не отметил блюда.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Позиция</th>
                    <th>Участник</th>
                    <th>Вес</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.map((assignment) => (
                    <tr
                      key={`${assignment.item_id}:${assignment.participant_id}`}
                    >
                      <td>{assignment.itemName}</td>
                      <td>{assignment.participantName}</td>
                      <td>{assignment.weight}</td>
                      <td>
                        <button
                          type="button"
                          className="danger"
                          disabled={loading}
                          onClick={() => handleDeleteAssignment(assignment)}
                        >
                          Снять
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Проверка результата</p>
              <h2>Предварительный итог</h2>
            </div>
            <button type="button" onClick={handleCalculate} disabled={loading}>
              Рассчитать
            </button>
          </div>

          {unassignedItems.length > 0 && (
            <p className="warning-box">
              Сначала распределите все позиции:{" "}
              {unassignedItems.map((item) => item.name).join(", ")}.
            </p>
          )}

          {calculation && (
            <CalculationTable
              calculation={calculation}
              room={room}
              payerName={payer?.name ?? ""}
            />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="participant-page">
      <RoomHeader
        room={room}
        role={participantSession ? "Участник" : "Гостевая ссылка"}
        lastUpdatedAt={lastUpdatedAt}
      />

      {error && <p className="error notice">{error}</p>}

      {!participantSession ? (
        <section className="card join-card">
          <p className="eyebrow">Присоединиться к счёту</p>
          <h2>Как вас зовут?</h2>
          <p className="muted">
            Если организатор уже добавил ваше имя, введите его так же. Иначе
            будет создан новый участник.
          </p>

          <form onSubmit={handleJoin} className="grid">
            <label>
              Имя
              <input
                autoFocus
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="Аня"
                maxLength={80}
              />
            </label>

            <button disabled={loading || !joinName.trim()}>
              {loading ? "Входим..." : "Войти в комнату"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="participant-summary">
            <div>
              <p className="eyebrow">Вы вошли как</p>
              <h2>{currentParticipant?.name ?? participantSession.name}</h2>
              <p className="muted">
                Нажмите на все позиции, которые относятся к вам. Общие блюда
                можно отметить нескольким людям.
              </p>
            </div>

            <div className="amount-panel">
              <span>Предварительно</span>
              <strong>
                {formatMoney(
                  participantPreview?.totalAmount ?? 0,
                  room.currency,
                )}
              </strong>
              {payer && <small>Плательщик: {payer.name}</small>}
            </div>
          </section>

          {items.length === 0 ? (
            <section className="card empty-state">
              <h2>Чек пока пуст</h2>
              <p className="muted">
                Организатор ещё не добавил позиции. Страница обновляется
                автоматически.
              </p>
            </section>
          ) : (
            <section className="item-grid">
              {items.map((item) => {
                const itemAssignments = assignments.filter(
                  (assignment) => assignment.item_id === item.id,
                );

                const selected = itemAssignments.some(
                  (assignment) =>
                    assignment.participant_id ===
                    participantSession.participantId,
                );

                const selectedNames = itemAssignments
                  .map(
                    (assignment) =>
                      participants.find(
                        (participant) =>
                          participant.id === assignment.participant_id,
                      )?.name,
                  )
                  .filter((name): name is string => Boolean(name));

                return (
                  <article
                    key={item.id}
                    className={`item-card ${
                      selected ? "item-card-selected" : ""
                    }`}
                  >
                    <div className="item-card-top">
                      <div>
                        <h3>{item.name}</h3>
                        {item.quantity > 1 && (
                          <p className="muted">
                            {item.quantity} ×{" "}
                            {formatMoney(item.unit_price, room.currency)}
                          </p>
                        )}
                      </div>
                      <strong>{formatMoney(item.total, room.currency)}</strong>
                    </div>

                    <div className="selected-by">
                      {selectedNames.length > 0 ? (
                        <>
                          <span>Выбрали:</span>
                          <p>{selectedNames.join(", ")}</p>
                        </>
                      ) : (
                        <p className="muted">Пока никто не выбрал</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={selected ? "selected-button" : ""}
                      disabled={selectionLoadingId === item.id}
                      onClick={() => handleToggleSelection(item)}
                    >
                      {selectionLoadingId === item.id
                        ? "Сохраняем..."
                        : selected
                          ? "✓ Это моё — снять"
                          : "Это моё"}
                    </button>
                  </article>
                );
              })}
            </section>
          )}

          <section className="card participant-breakdown">
            <div>
              <p className="eyebrow">Текущая доля</p>
              <h2>
                {formatMoney(
                  participantPreview?.totalAmount ?? 0,
                  room.currency,
                )}
              </h2>
            </div>

            {participantPreview && (
              <div className="breakdown-grid">
                <span>
                  Блюда
                  <strong>
                    {formatMoney(participantPreview.baseAmount, room.currency)}
                  </strong>
                </span>
                <span>
                  Сервис
                  <strong>
                    {formatMoney(
                      participantPreview.serviceShare,
                      room.currency,
                    )}
                  </strong>
                </span>
                <span>
                  Чаевые
                  <strong>
                    {formatMoney(participantPreview.tipShare, room.currency)}
                  </strong>
                </span>
                <span>
                  Скидка
                  <strong>
                    −
                    {formatMoney(
                      participantPreview.discountShare,
                      room.currency,
                    )}
                  </strong>
                </span>
              </div>
            )}

            <p className="muted">
              Сумма предварительная: она может измениться, когда другие
              участники отметят общие блюда.
            </p>
          </section>

          <div className="participant-footer">
            <button
              type="button"
              className="secondary"
              onClick={() => void loadRoomData(roomId, false)}
            >
              Обновить сейчас
            </button>
            <button
              type="button"
              className="link-button"
              onClick={handleLeaveParticipantMode}
            >
              Выйти из участника
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function RoomHeader({
  room,
  role,
  lastUpdatedAt,
}: {
  room: Room;
  role: string;
  lastUpdatedAt: Date | null;
}) {
  return (
    <header className="room-header">
      <div>
        <p className="eyebrow">{role}</p>
        <h1>{room.title}</h1>
        <p className="muted">
          Комната <code>{room.id}</code>
        </p>
      </div>

      <div className="live-indicator">
        <span />
        <div>
          <strong>Автообновление</strong>
          <small>
            {lastUpdatedAt
              ? lastUpdatedAt.toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "загрузка"}
          </small>
        </div>
      </div>
    </header>
  );
}

function CalculationTable({
  calculation,
  room,
  payerName,
}: {
  calculation: CalculateResponse;
  room: Room;
  payerName: string;
}) {
  return (
    <>
      <div className="summary-grid">
        <p>
          Позиции:{" "}
          <strong>{formatMoney(calculation.subtotal, room.currency)}</strong>
        </p>
        <p>
          Рассчитано:{" "}
          <strong>
            {formatMoney(calculation.calculated_total, room.currency)}
          </strong>
        </p>
        {room.expected_total > 0 && (
          <p>
            На чеке:{" "}
            <strong>{formatMoney(room.expected_total, room.currency)}</strong>
          </p>
        )}
        {payerName && (
          <p>
            Плательщик: <strong>{payerName}</strong>
          </p>
        )}
      </div>

      {room.expected_total > 0 &&
        (calculation.matches_expected_total ? (
          <p className="success">Сумма совпадает с итогом на чеке.</p>
        ) : (
          <p className="error">
            Расхождение: {formatMoney(calculation.difference, room.currency)}.
            Проверьте позиции, сборы, чаевые и скидку.
          </p>
        ))}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Участник</th>
              <th>Позиции</th>
              <th>Сервис</th>
              <th>Чаевые</th>
              <th>Скидка</th>
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            {calculation.results.map((result) => (
              <tr key={result.participant_id}>
                <td>{result.name}</td>
                <td>{formatMoney(result.base_amount, room.currency)}</td>
                <td>{formatMoney(result.service_share, room.currency)}</td>
                <td>{formatMoney(result.tip_share, room.currency)}</td>
                <td>−{formatMoney(result.discount_share, room.currency)}</td>
                <td>
                  <strong>
                    {formatMoney(result.total_amount, room.currency)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
