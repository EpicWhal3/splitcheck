export type ParticipantSession = {
  participantId: string;
  participantToken: string;
  name: string;
};

function adminKey(roomId: string): string {
  return `split-admin:${roomId}`;
}

function participantKey(roomId: string): string {
  return `split-participant:${roomId}`;
}

export function saveAdminToken(roomId: string, token: string): void {
  window.localStorage.setItem(adminKey(roomId), token);
}

export function loadAdminToken(roomId: string): string {
  return window.localStorage.getItem(adminKey(roomId)) ?? "";
}

export function clearAdminToken(roomId: string): void {
  window.localStorage.removeItem(adminKey(roomId));
}

export function saveParticipantSession(
  roomId: string,
  session: ParticipantSession,
): void {
  window.localStorage.setItem(participantKey(roomId), JSON.stringify(session));
}

export function loadParticipantSession(
  roomId: string,
): ParticipantSession | null {
  const raw = window.localStorage.getItem(participantKey(roomId));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ParticipantSession>;

    if (
      typeof parsed.participantId !== "string" ||
      typeof parsed.participantToken !== "string" ||
      typeof parsed.name !== "string" ||
      !parsed.participantId ||
      !parsed.participantToken
    ) {
      return null;
    }

    return {
      participantId: parsed.participantId,
      participantToken: parsed.participantToken,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}

export function clearParticipantSession(roomId: string): void {
  window.localStorage.removeItem(participantKey(roomId));
}
