const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type Room = {
  id: string;
  title: string;
  currency: string;
  service_fee: number;
  tip_amount: number;
  discount: number;
  expected_total: number;
  payer_participant_id: string;
};

export type Participant = {
  id: string;
  room_id: string;
  name: string;
  claimed: boolean;
};

export type ReceiptItem = {
  id: string;
  room_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ItemAssignment = {
  item_id: string;
  participant_id: string;
  weight: number;
};

export type ParticipantResult = {
  participant_id: string;
  name: string;
  base_amount: number;
  service_share: number;
  tip_share: number;
  discount_share: number;
  total_amount: number;
};

export type RoomDetails = {
  room: Room;
  participants: Participant[];
  items: ReceiptItem[];
  assignments: ItemAssignment[];
  subtotal: number;
};

export type JoinRoomResponse = {
  participant: Participant;
  participant_token: string;
};

export type createRoomResponse = {
  room: Room;
  admin_token: string;
};

export type CalculateResponse = {
  room: Room;
  results: ParticipantResult[];
  subtotal: number;
  calculated_total: number;
  difference: number;
  matches_expected_total: boolean;
};

type APIErrorPayload = {
  error?: string;
  message?: string;
};

type RequestOptions = RequestInit & {
  adminToken?: string;
  participantToken?: string;
};

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const { adminToken, participantToken, ...fetchOptions } = options ?? {};

  const headers = new Headers(fetchOptions.headers);

  if (fetchOptions.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (adminToken) {
    headers.set("X-Admin-Token", adminToken);
  }

  if (participantToken) {
    headers.set("X-Participant-Token", participantToken);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => null)) as
    | APIErrorPayload
    | T
    | null;

  if (!response.ok) {
    const errorData = data as APIErrorPayload | null;

    const message =
      errorData?.error ??
      errorData?.message ??
      `Ошибка запроса: ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

function id(value: string): string {
  return encodeURIComponent(value);
}

export function createRoom(payload: {
  title: string;
  currency: string;
  expected_total?: number;
}) {
  return request<createRoomResponse>("/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRoom(roomId: string) {
  return request<RoomDetails>(`/rooms/${id(roomId)}`);
}

export function updateRoom(
  roomId: string,
  adminToken: string,
  payload: Partial<{
    title: string;
    currency: string;
    service_fee: number;
    tip_amount: number;
    discount: number;
    expected_total: number;
    payer_participant_id: string;
  }>,
) {
  return request<Room>(`/rooms/${id(roomId)}`, {
    method: "PATCH",
    adminToken,
    body: JSON.stringify(payload),
  });
}

export function joinRoom(
  roomId: string,
  payload: {
    name: string;
  },
) {
  return request<JoinRoomResponse>(`/rooms/${id(roomId)}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addParticipant(
  roomId: string,
  adminToken: string,
  payload: {
    name: string;
  },
) {
  return request<Participant>(`/rooms/${id(roomId)}/participants`, {
    method: "POST",
    adminToken,
    body: JSON.stringify(payload),
  });
}

export function updateParticipant(
  roomId: string,
  participantId: string,
  adminToken: string,
  payload: {
    name: string;
  },
) {
  return request<Participant>(
    `/rooms/${id(roomId)}/participants/${id(participantId)}`,
    {
      method: "PATCH",
      adminToken,
      body: JSON.stringify(payload),
    },
  );
}

export function deleteParticipant(
  roomId: string,
  adminToken: string,
  participantId: string,
) {
  return request<void>(
    `/rooms/${id(roomId)}/participants/${id(participantId)}`,
    {
      method: "DELETE",
      adminToken,
    },
  );
}

export function addItem(
  roomId: string,
  adminToken: string,
  payload: {
    name: string;
    quantity: number;
    unit_price: number;
  },
) {
  return request<ReceiptItem>(`/rooms/${id(roomId)}/items`, {
    method: "POST",
    adminToken,
    body: JSON.stringify(payload),
  });
}

export function updateItem(
  roomId: string,
  itemId: string,
  adminToken: string,
  payload: Partial<{
    name: string;
    quantity: number;
    unit_price: number;
  }>,
) {
  return request<ReceiptItem>(`/rooms/${id(roomId)}/items/${id(itemId)}`, {
    method: "PATCH",
    adminToken,
    body: JSON.stringify(payload),
  });
}

export function deleteItem(roomId: string, itemId: string, adminToken: string) {
  return request<void>(`/rooms/${id(roomId)}/items/${id(itemId)}`, {
    method: "DELETE",
    adminToken,
  });
}

export function addAssignment(
  roomId: string,
  adminToken: string,
  payload: {
    item_id: string;
    participant_id: string;
    weight: number;
  },
) {
  return request<ItemAssignment>(`/rooms/${id(roomId)}/assignments`, {
    method: "POST",
    adminToken,
    body: JSON.stringify(payload),
  });
}

export function deleteAssignment(
  roomId: string,
  itemId: string,
  participantId: string,
  adminToken: string,
) {
  return request<void>(
    `/rooms/${id(roomId)}/assignments/${id(itemId)}/${id(participantId)}`,
    {
      method: "DELETE",
      adminToken,
    },
  );
}

export function selectItem(
  roomId: string,
  itemId: string,
  participantToken: string,
) {
  return request<ItemAssignment>(
    `/rooms/${id(roomId)}/selections/${id(itemId)}`,
    {
      method: "PUT",
      participantToken,
    },
  );
}

export function unselectItem(
  roomId: string,
  itemId: string,
  participantToken: string,
) {
  return request<void>(`/rooms/${id(roomId)}/selections/${id(itemId)}`, {
    method: "DELETE",
    participantToken,
  });
}

export function calculateRoom(roomId: string) {
  return request<CalculateResponse>(`/rooms/${id(roomId)}/calculate`, {
    method: "POST",
  });
}
