"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

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
  type Participant,
  type ReceiptItem,
  type Room,
  updateItem,
  updateParticipant,
  updateRoom,
} from "../../../lib/api";

import { formatMoney, tryParseMoneyToMinorUnits } from "../../../lib/money";

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

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    params.then((resolved) => setRoomId(resolved.roomId));
  }, [params]);

  useEffect(() => {
    if (roomId) {
      void loadRoom(roomId);
    }
  }, [roomId]);

  async function loadRoom(id: string) {
    setError("");

    try {
      const data = await getRoom(id);

      const nextParticipants = data.participants ?? [];

      const nextItems = data.items ?? [];

      const nextAssignments = data.assignments ?? [];

      setRoom(data.room);
      setParticipants(nextParticipants);
      setItems(nextItems);
      setAssignments(nextAssignments);

      setServiceFee(String(data.room.service_fee / 100));

      setTipAmount(String(data.room.tip_amount / 100));

      setDiscount(String(data.room.discount / 100));

      setExpectedTotal(String(data.room.expected_total / 100));

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки комнаты");
    }
  }

  async function runMutation(action: () => Promise<unknown>) {
    if (!roomId) {
      return false;
    }

    setLoading(true);
    setError("");

    try {
      await action();
      await loadRoom(roomId);

      setCalculation(null);

      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка выполнения операции",
      );

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

  async function handleUpdateCharges(event: FormEvent<HTMLFormElement>) {
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

    await runMutation(() =>
      updateRoom(roomId, {
        service_fee: parsedServiceFee,
        tip_amount: parsedTipAmount,
        discount: parsedDiscount,
        expected_total: parsedExpectedTotal,
      }),
    );
  }

  async function handleAddParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = participantName.trim();

    if (!name) {
      return;
    }

    const success = await runMutation(() =>
      addParticipant(roomId, {
        name,
      }),
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

    await runMutation(() =>
      updateParticipant(roomId, participant.id, {
        name: name.trim(),
      }),
    );
  }

  async function handleDeleteParticipant(participant: Participant) {
    const confirmed = window.confirm(
      `Удалить участника «${participant.name}»? Его назначения на блюда также будут удалены.`,
    );

    if (!confirmed) {
      return;
    }

    await runMutation(() => deleteParticipant(roomId, participant.id));
  }

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
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

    const success = await runMutation(() =>
      addItem(roomId, {
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

    await runMutation(() =>
      updateItem(roomId, item.id, {
        name: name.trim(),
        quantity,
        unit_price: unitPrice,
      }),
    );
  }

  async function handleDeleteItem(item: ReceiptItem) {
    const confirmed = window.confirm(
      `Удалить позицию «${item.name}»? Все её назначения также будут удалены.`,
    );

    if (!confirmed) {
      return;
    }

    await runMutation(() => deleteItem(roomId, item.id));
  }

  async function handleAddAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericWeight = Number(weight);

    if (!Number.isInteger(numericWeight) || numericWeight <= 0) {
      setError("Вес должен быть положительным целым числом");

      return;
    }

    if (!selectedItemId || !selectedParticipantId) {
      return;
    }

    await runMutation(() =>
      addAssignment(roomId, {
        item_id: selectedItemId,
        participant_id: selectedParticipantId,
        weight: numericWeight,
      }),
    );
  }

  async function handleDeleteAssignment(assignment: ItemAssignment) {
    await runMutation(() =>
      deleteAssignment(roomId, assignment.item_id, assignment.participant_id),
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

  if (!room) {
    return (
      <main>
        <h1>Комната счёта</h1>

        {error ? <p className="error">{error}</p> : <p>Загрузка...</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>{room.title}</h1>

      <p className="muted">
        ID комнаты: <code>{room.id}</code>
      </p>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Суммы по чеку</h2>

        <form onSubmit={handleUpdateCharges} className="grid grid-4">
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

          <button disabled={loading}>Сохранить суммы</button>
        </form>

        <p className="muted">
          Сумма позиций сейчас: {formatMoney(subtotal, room.currency)}
        </p>
      </section>

      <section className="card">
        <h2>Участники</h2>

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
            Добавить участника
          </button>
        </form>

        {participants.length === 0 ? (
          <p className="muted">Пока нет участников.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Действия</th>
                </tr>
              </thead>

              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.id}>
                    <td>{participant.name}</td>

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
        <h2>Позиции чека</h2>

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
          <p className="muted">Пока нет позиций.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Кол-во</th>
                  <th>Цена</th>
                  <th>Итого</th>
                  <th>Действия</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>

                    <td>{item.quantity}</td>

                    <td>{formatMoney(item.unit_price, room.currency)}</td>

                    <td>{formatMoney(item.total, room.currency)}</td>

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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Распределение позиций</h2>

        <form onSubmit={handleAddAssignment} className="grid grid-3">
          <label>
            Позиция
            <select
              value={selectedItemId}
              onChange={(event) => setSelectedItemId(event.target.value)}
            >
              <option value="">Выбери позицию</option>

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
              onChange={(event) => setSelectedParticipantId(event.target.value)}
            >
              <option value="">Выбери участника</option>

              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Вес
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
            Назначить
          </button>
        </form>

        <p className="muted">
          Повторное назначение той же пары обновляет вес. Для равного деления
          укажи каждому участнику вес 1.
        </p>

        {assignmentRows.length === 0 ? (
          <p className="muted">Пока нет распределений.</p>
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
                        Снять назначение
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
        <h2>Итог</h2>

        <button onClick={handleCalculate} disabled={loading}>
          Рассчитать
        </button>

        {calculation && (
          <>
            <div className="summary-grid">
              <p>
                Позиции:{" "}
                <strong>
                  {formatMoney(calculation.subtotal, room.currency)}
                </strong>
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
                  <strong>
                    {formatMoney(room.expected_total, room.currency)}
                  </strong>
                </p>
              )}
            </div>

            {room.expected_total > 0 &&
              (calculation.matches_expected_total ? (
                <p className="success">Сумма совпадает с итогом на чеке.</p>
              ) : (
                <p className="error">
                  Расхождение:{" "}
                  {formatMoney(calculation.difference, room.currency)}. Проверь
                  позиции, сборы, чаевые и скидку.
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

                      <td>
                        {formatMoney(result.service_share, room.currency)}
                      </td>

                      <td>{formatMoney(result.tip_share, room.currency)}</td>

                      <td>
                        -{formatMoney(result.discount_share, room.currency)}
                      </td>

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
        )}
      </section>
    </main>
  );
}
