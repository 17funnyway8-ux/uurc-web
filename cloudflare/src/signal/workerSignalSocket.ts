import { STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS } from "@uurc/shared/streamer/signal";
import {
  normalizeSignalGatewayInboundEventsAsync,
  normalizeSignalGatewayPayload,
} from "@uurc/shared/signalGatewayProtocol";
import type { RemoteSignalGatewayEvent } from "@uurc/shared/types";

import {
  ENGINE_IO_CLOSE,
  ENGINE_IO_MESSAGE,
  ENGINE_IO_OPEN,
  ENGINE_IO_PING,
  ENGINE_IO_PONG,
  SOCKET_IO_NAMESPACE,
  buildEngineIoWebSocketUrl,
  deconstructBinary,
  encodeSocketIoPacket,
  ensureEngineIoBinaryFramePrefix,
  parseEngineOpenPacket,
  parseSocketIoPacket,
  reconstructBinaryPlaceholders,
  stripEngineIoBinaryFramePrefix,
  type SocketIoPacket,
} from "./socketIoWire.js";
import { toWebSocketBytes, workerSignalGatewayBinary } from "./workerSignalBinaryCodec.js";

type JsonRecord = Record<string, unknown>;

interface PendingAck {
  event: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve(ack: unknown[]): void;
  reject(error: Error): void;
}

interface PendingBinaryPacket {
  packet: SocketIoPacket;
  buffers: Uint8Array[];
}

interface WorkerSignalSocketCallbacks {
  onEvent(event: Omit<RemoteSignalGatewayEvent, "id" | "receivedAt">): void;
  onClose(reason: string): void;
  onError(reason: string): void;
}

export class WorkerSignalSocket {
  private socket: WebSocket | null = null;
  private nextAckId = 0;
  private pendingAcks = new Map<number, PendingAck>();
  private pendingBinaryPacket: PendingBinaryPacket | null = null;
  private manualClose = false;
  private namespaceConnected = false;

  connectionId: string | undefined;

  constructor(private readonly callbacks: WorkerSignalSocketCallbacks) {}

  get connected(): boolean {
    return this.socket !== null && this.namespaceConnected;
  }

  async connect(signalServer: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<void> {
    const socket = await openSignalWebSocket(signalServer, headers, timeoutMs);
    this.socket = socket;
    this.manualClose = false;

    await this.completeHandshake(socket, timeoutMs);
    if (socket !== this.socket) return;

    socket.addEventListener("message", (event) => {
      if (socket !== this.socket) return;
      void this.handleSocketMessage(event.data);
    });
    socket.addEventListener("close", (event) => {
      if (socket !== this.socket) return;
      this.handleSocketClose(event);
    });
    socket.addEventListener("error", () => {
      if (socket !== this.socket) return;
      console.log("[uurc-do] upstream socket error");
      this.callbacks.onError("signal socket error");
    });
  }

  emitWithAck(event: string, payload: JsonRecord, ackTimeoutMs: number): Promise<unknown[]> {
    const ackId = this.emitSocketEvent(event, payload);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(ackId);
        reject(new Error(`signal event ${event} ack timed out after ${ackTimeoutMs}ms`));
      }, ackTimeoutMs);
      this.pendingAcks.set(ackId, { event, timeout, resolve, reject });
    });
  }

  emitWithOptionalAck(event: string, payload: JsonRecord, onAck: (ack: unknown[]) => void): void {
    const ackId = this.emitSocketEvent(event, payload);
    const timeout = setTimeout(() => this.pendingAcks.delete(ackId), STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS);
    this.pendingAcks.set(ackId, {
      event,
      timeout,
      resolve: onAck,
      reject: () => {},
    });
  }

  async close(): Promise<void> {
    this.manualClose = true;
    this.rejectPendingAcks("signal socket closed");
    const socket = this.socket;
    const wasConnected = this.namespaceConnected;
    this.socket = null;
    this.connectionId = undefined;
    this.namespaceConnected = false;
    this.pendingBinaryPacket = null;
    this.nextAckId = 0;
    if (!socket) return;
    try {
      if (wasConnected) socket.send(`${ENGINE_IO_MESSAGE}${ENGINE_IO_CLOSE}`);
      socket.close(1000, "gateway stopped");
    } catch {
      // Closing an already terminated upstream socket is harmless.
    }
  }

  private async completeHandshake(socket: WebSocket, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`signal socket connect timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onClose);
        socket.removeEventListener("error", onError);
      };
      const onMessage = (event: MessageEvent) => {
        if (socket !== this.socket) {
          cleanup();
          reject(new Error("signal gateway start was superseded"));
          return;
        }
        void this.handleSocketMessage(event.data, {
          onConnected: () => {
            cleanup();
            resolve();
          },
          onConnectError: (error) => {
            cleanup();
            reject(error);
          },
        });
      };
      const onClose = (event: CloseEvent) => {
        cleanup();
        reject(new Error(`signal socket closed before connect code=${event.code} reason=${event.reason}`));
      };
      const onError = () => {
        cleanup();
        reject(new Error("signal socket error before connect"));
      };

      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onClose);
      socket.addEventListener("error", onError);
    });
  }

  private async handleSocketMessage(
    value: unknown,
    callbacks: { onConnected?: () => void; onConnectError?: (error: Error) => void } = {},
  ): Promise<void> {
    if (typeof value === "string") {
      await this.handleTextFrame(value, callbacks);
      return;
    }
    await this.handleBinaryFrame(await toWebSocketBytes(value));
  }

  private async handleTextFrame(
    frame: string,
    callbacks: { onConnected?: () => void; onConnectError?: (error: Error) => void },
  ): Promise<void> {
    if (frame.startsWith(ENGINE_IO_OPEN)) {
      this.connectionId = parseEngineOpenPacket(frame.slice(1)).sid;
      this.sendRaw(`${ENGINE_IO_MESSAGE}0`);
      return;
    }
    if (frame === ENGINE_IO_PING) {
      this.sendRaw(ENGINE_IO_PONG);
      return;
    }
    if (frame === ENGINE_IO_CLOSE) {
      await this.close();
      return;
    }
    if (!frame.startsWith(ENGINE_IO_MESSAGE)) return;

    const packet = parseSocketIoPacket(frame.slice(1));
    if (packet.type === 0) {
      const data = asRecord(packet.data);
      this.connectionId = typeof data?.sid === "string" ? data.sid : this.connectionId;
      this.namespaceConnected = true;
      callbacks.onConnected?.();
      return;
    }
    if (packet.type === 4) {
      callbacks.onConnectError?.(new Error(`socket.io connect error: ${safeJson(packet.data)}`));
      return;
    }
    if (packet.attachments > 0) {
      this.pendingBinaryPacket = { packet, buffers: [] };
      return;
    }
    await this.processSocketIoPacket(packet);
  }

  private async handleBinaryFrame(rawBytes: Uint8Array): Promise<void> {
    const bytes = stripEngineIoBinaryFramePrefix(rawBytes);
    const pending = this.pendingBinaryPacket;
    if (!pending) {
      this.callbacks.onEvent({
        direction: "inbound",
        event: "binary",
        payload: normalizeSignalGatewayPayload(bytes, workerSignalGatewayBinary),
      });
      return;
    }

    pending.buffers.push(bytes);
    if (pending.buffers.length < pending.packet.attachments) return;
    this.pendingBinaryPacket = null;
    await this.processSocketIoPacket({
      ...pending.packet,
      data: reconstructBinaryPlaceholders(pending.packet.data, pending.buffers),
    });
  }

  private async processSocketIoPacket(packet: SocketIoPacket): Promise<void> {
    if (packet.type === 2 || packet.type === 5) {
      await this.processSocketIoEvent(packet.data);
      return;
    }
    if (packet.type === 3 || packet.type === 6) this.resolveAck(packet);
  }

  private async processSocketIoEvent(data: unknown): Promise<void> {
    if (!Array.isArray(data) || typeof data[0] !== "string") return;
    const event = data[0];
    const payload = data.slice(1);
    for (const normalized of await normalizeSignalGatewayInboundEventsAsync(
      event,
      payload,
      workerSignalGatewayBinary,
    )) {
      console.log(`[uurc-do] inbound ${normalized.event}`);
      this.callbacks.onEvent({
        direction: "inbound",
        event: normalized.event,
        payload: normalizeSignalGatewayPayload(normalized.payload, workerSignalGatewayBinary),
      });
    }
  }

  private resolveAck(packet: SocketIoPacket): void {
    if (packet.id === undefined) return;
    const pending = this.pendingAcks.get(packet.id);
    if (!pending) return;
    this.pendingAcks.delete(packet.id);
    clearTimeout(pending.timeout);
    pending.resolve(Array.isArray(packet.data) ? packet.data : [packet.data]);
  }

  private emitSocketEvent(event: string, payload: JsonRecord): number {
    if (!this.connected) throw new Error("signal gateway socket is not connected");
    const ackId = this.nextAckId++;
    const deconstructed = deconstructBinary([event, payload]);
    const encoded = encodeSocketIoPacket({
      type: deconstructed.buffers.length > 0 ? 5 : 2,
      namespace: SOCKET_IO_NAMESPACE,
      attachments: deconstructed.buffers.length,
      id: ackId,
      data: deconstructed.data,
    });
    this.sendRaw(`${ENGINE_IO_MESSAGE}${encoded}`);
    for (const buffer of deconstructed.buffers) this.sendRaw(ensureEngineIoBinaryFramePrefix(buffer));
    return ackId;
  }

  private sendRaw(frame: string | Uint8Array): void {
    this.socket?.send(frame);
  }

  private handleSocketClose(event: CloseEvent): void {
    console.log(`[uurc-do] upstream socket close code=${event.code} reason=${event.reason} manual=${this.manualClose}`);
    this.rejectPendingAcks(
      `signal socket closed before pending ack code=${event.code} reason=${event.reason}`,
      event,
    );
    this.socket = null;
    this.namespaceConnected = false;
    if (!this.manualClose) this.callbacks.onClose(`signal socket closed code=${event.code} reason=${event.reason}`);
  }

  private rejectPendingAcks(message: string, event?: CloseEvent): void {
    for (const [id, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
      pending.reject(
        event
          ? new Error(`signal socket closed before ${pending.event} ack code=${event.code} reason=${event.reason}`)
          : new Error(message),
      );
      this.pendingAcks.delete(id);
    }
  }
}

async function openSignalWebSocket(
  signalServer: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<WebSocket> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildEngineIoWebSocketUrl(signalServer), {
      headers: { ...headers, Upgrade: "websocket" },
      signal: controller.signal,
    });
    const socket = response.webSocket;
    if (!socket) throw new Error(`server did not accept websocket status=${response.status}`);
    socket.binaryType = "arraybuffer";
    socket.accept();
    return socket;
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
