export type RoomSocket = {
  binaryType: string;
  readyState: number;
  send: (data: string | Uint8Array) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer | Uint8Array }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

export type TransportEvent =
  | { type: "status"; status: ConnectionStatus }
  | { type: "open" }
  | { type: "message"; data: string | ArrayBuffer | Uint8Array }
  | { type: "close" }
  | { type: "error" };

export type RoomTransportOptions = {
  url: string;
  socketFactory: (url: string) => RoomSocket;
  reconnectDelays?: readonly number[];
};

const OPEN = 1;
const DEFAULT_RECONNECT_DELAYS = [500, 1000, 2000, 3000] as const;

export class RoomTransport {
  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private readonly reconnectDelays: readonly number[];
  private socket: RoomSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private statusValue: ConnectionStatus = "offline";

  constructor(private readonly options: RoomTransportOptions) {
    this.reconnectDelays = options.reconnectDelays ?? DEFAULT_RECONNECT_DELAYS;
  }

  get status(): ConnectionStatus {
    return this.statusValue;
  }

  connect(): void {
    if (this.socket && this.statusValue !== "offline") return;

    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const socket = this.options.socketFactory(this.options.url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setStatus("live");
      this.emit({ type: "open" });
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.emit({ type: "message", data: event.data });
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.emit({ type: "error" });
      if (this.statusValue !== "offline") this.setStatus("reconnecting");
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.emit({ type: "close" });
      if (this.statusValue !== "offline") this.scheduleReconnect();
    };
    this.socket = socket;
  }

  reconnect(): void {
    if (this.statusValue === "offline" || !this.socket) return;
    const socket = this.socket;
    this.socket = null;
    this.emit({ type: "close" });
    socket.close();
    this.scheduleReconnect();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.setStatus("offline");
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  markHealthy(): void {
    this.reconnectAttempt = 0;
  }

  send(data: string | Uint8Array): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    this.socket.send(data);
    return true;
  }

  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectDelays.length === 0) return;
    this.setStatus("reconnecting");
    const delay =
      this.reconnectDelays[Math.min(this.reconnectAttempt, this.reconnectDelays.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.emit({ type: "status", status });
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
