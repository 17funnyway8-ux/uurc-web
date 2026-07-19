import { STREAMER_ANDROID_TO_MAC_KEY_CODES, STREAMER_ANDROID_TO_WINDOWS_KEY_CODES } from "./internal/keyCodes.js";

export const STREAMER_INPUT_MANAGER_IME_CONTROL_CODES = {
  BACKSPACE: 14,
  ENTER: 28,
  HIDESELF: 100001,
} as const;

export type StreamerImeControlKind = keyof typeof STREAMER_INPUT_MANAGER_IME_CONTROL_CODES;

export const STREAMER_MUMU_SYSTEM_KEY_CODES = {
  BACK: 158,
  HOME: 172,
  MENU: 580,
} as const;

export type StreamerMumuSystemKey = keyof typeof STREAMER_MUMU_SYSTEM_KEY_CODES;

export const STREAMER_DESKTOP_INPUT_EVENT_TYPES = {
  mousePress: "mouse_press",
  mouseRelease: "mouse_release",
  mouseClick: "mouse_click",
  mouseMoveAbsolute: "mouse_move_absolute",
  mouseMoveRelative: "mouse_move_relative",
  mouseScroll: "mouse_scroll",
  keyboardPress: "kbd_press",
  keyboardRelease: "kbd_release",
  keyboardClick: "kbd_click",
} as const;

export type StreamerDesktopInputEventKind = keyof typeof STREAMER_DESKTOP_INPUT_EVENT_TYPES;

export const STREAMER_MOUSE_BUTTON_CODES = {
  primary: 1,
  secondary: 2,
  tertiary: 4,
  back: 8,
  forward: 16,
} as const;

export type StreamerMouseButtonKind = keyof typeof STREAMER_MOUSE_BUTTON_CODES;

export const STREAMER_INPUT_MANAGER_TOUCH_SLOTS = [26, 27, 28, 29, 30, 31] as const;

export interface BuildStreamerSystemKeyInputMessagesInput {
  displayId: number;
  key: StreamerMumuSystemKey;
}

export interface BuildStreamerMouseButtonInputMessageInput {
  action: "mousePress" | "mouseRelease" | "mouseClick";
  button: StreamerMouseButtonKind | number;
}

export interface BuildStreamerMouseMoveAbsoluteInputMessageInput {
  absX: number;
  absY: number;
}

export interface BuildStreamerMacMouseMoveAbsoluteInputMessageInput extends BuildStreamerMouseMoveAbsoluteInputMessageInput {
  surfaceWidth: number;
  surfaceHeight: number;
}

export interface BuildStreamerMouseScrollInputMessageInput {
  deltaX: number;
  deltaY: number;
}

export interface BuildStreamerKeyboardInputMessageInput {
  action: "keyboardPress" | "keyboardRelease" | "keyboardClick";
  value: string | number;
}

export interface StreamerTouchSurface {
  displayId: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface StreamerTouchPoint {
  id: number;
  relX: number;
  relY: number;
}

export interface StreamerTouchInputTracker {
  start(): string[];
  update(points: readonly StreamerTouchPoint[]): string[];
  end(): string[];
  reset(): string[];
}

export function buildStreamerImeTextInputMessage(text: string): string {
  return `TEXT:${text}`;
}

export function buildStreamerImeControlInputMessage(kind: StreamerImeControlKind): string {
  return `TEXT_CONTROL:${kind}`;
}

export function buildStreamerSystemKeyInputMessages(input: BuildStreamerSystemKeyInputMessagesInput): string[] {
  const keyCode = STREAMER_MUMU_SYSTEM_KEY_CODES[input.key];
  return [`${input.displayId}:KBDPR:${keyCode}:1\n`, `${input.displayId}:KBDRL:${keyCode}:0\n`];
}

export function buildStreamerMouseButtonInputMessage(input: BuildStreamerMouseButtonInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    button: normalizeStreamerMouseButtonCode(input.button),
  });
}

export function buildStreamerMouseMoveAbsoluteInputMessage(
  input: BuildStreamerMouseMoveAbsoluteInputMessageInput,
): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: Math.round(input.absX),
    abs_y: Math.round(input.absY),
  });
}

export function buildStreamerMacMouseMoveAbsoluteInputMessage(
  input: BuildStreamerMacMouseMoveAbsoluteInputMessageInput,
): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: normalizeAbsolutePointerAxis(input.absX, input.surfaceWidth),
    abs_y: normalizeAbsolutePointerAxis(input.absY, input.surfaceHeight),
  });
}

export function buildStreamerMouseScrollInputMessage(input: BuildStreamerMouseScrollInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseScroll,
    delta_x: Math.round(input.deltaX),
    delta_y: Math.round(input.deltaY),
  });
}

export function buildStreamerMacMouseScrollInputMessage(input: BuildStreamerMouseScrollInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseScroll,
    delta_x: Math.round(input.deltaX),
    delta_y: Math.round(input.deltaY),
  });
}

export function buildStreamerKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    key: input.value,
  });
}

export function buildStreamerMacKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  const key = transformStreamerAndroidKeyCodeToMac(input.value);
  if (key === undefined) return "";
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    key,
  });
}

export function transformStreamerAndroidKeyCodeToMac(value: string | number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return STREAMER_ANDROID_TO_MAC_KEY_CODES[Math.trunc(value)];
}

// 桌面被控端打字走独立的 text_input(单次上屏的字符内容），而非逐键 kbd_press。
// 这样可避免被控端对"按住未抬起"的软件级自动重复(网络延迟会把按下→抬起拉长，导致字母连发),
// 也是中文/IME 文本的承载方式。真机抓包:{"action":"text_input","content":"abc"}。
export function buildStreamerTextInputMessage(content: string): string {
  return JSON.stringify({ action: "text_input", content });
}

export function buildStreamerWindowsKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  const key = transformStreamerAndroidKeyCodeToWindows(input.value);
  if (key === undefined) return "";
  // 官方安卓主控端发往 Windows 的 kbd 报文带有 interrept 字段(真机抓包确认，拼写以被控端为准，原样复刻）。
  return JSON.stringify({ action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action], key, interrept: true });
}

export function transformStreamerAndroidKeyCodeToWindows(value: string | number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return STREAMER_ANDROID_TO_WINDOWS_KEY_CODES[Math.trunc(value)];
}

function normalizeAbsolutePointerAxis(value: number, size: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  return Math.min(1, Math.max(0, value / size));
}

export function createStreamerTouchInputTracker(surface: StreamerTouchSurface): StreamerTouchInputTracker {
  return new TouchInputTracker(surface);
}

function normalizeStreamerMouseButtonCode(button: StreamerMouseButtonKind | number): number {
  return typeof button === "number" ? button : STREAMER_MOUSE_BUTTON_CODES[button];
}

class TouchInputTracker implements StreamerTouchInputTracker {
  private readonly activeSlotsByTouchId = new Map<number, number>();

  constructor(private readonly surface: StreamerTouchSurface) {}

  start(): string[] {
    return this.reset();
  }

  update(points: readonly StreamerTouchPoint[]): string[] {
    const nextTouchIds = new Set(points.map((point) => point.id));
    const releaseSlots = [...this.activeSlotsByTouchId.entries()]
      .filter(([touchId]) => !nextTouchIds.has(touchId))
      .sort(([leftTouchId], [rightTouchId]) => leftTouchId - rightTouchId)
      .map(([touchId, slot]) => {
        this.activeSlotsByTouchId.delete(touchId);
        return slot;
      });

    const messages: string[] = [];
    if (releaseSlots.length > 0) {
      messages.push(cookStreamerTouchCommand(this.surface.displayId, `SLOTMULTIRELEASE:${releaseSlots.join(":")}`));
    }

    const pressParts: string[] = [];
    for (const point of points) {
      const slot = this.slotForTouch(point.id);
      if (slot === null) continue;
      const { x, y } = transformStreamerTouchPoint(this.surface, point);
      pressParts.push(`${slot}:${slot}:${x}:${y}`);
    }

    if (pressParts.length > 0) {
      messages.push(cookStreamerTouchCommand(this.surface.displayId, `SLOTMULTIPRESS:${pressParts.join(":")}`));
    }

    return messages;
  }

  end(): string[] {
    return this.reset();
  }

  reset(): string[] {
    this.activeSlotsByTouchId.clear();
    return [
      cookStreamerTouchCommand(
        this.surface.displayId,
        `SLOTMULTIRELEASE:${STREAMER_INPUT_MANAGER_TOUCH_SLOTS.join(":")}`,
      ),
    ];
  }

  private slotForTouch(touchId: number): number | null {
    const currentSlot = this.activeSlotsByTouchId.get(touchId);
    if (currentSlot !== undefined) return currentSlot;

    const usedSlots = new Set(this.activeSlotsByTouchId.values());
    const slot = STREAMER_INPUT_MANAGER_TOUCH_SLOTS.find((candidate) => !usedSlots.has(candidate));
    if (slot === undefined) return null;
    this.activeSlotsByTouchId.set(touchId, slot);
    return slot;
  }
}

function transformStreamerTouchPoint(
  surface: StreamerTouchSurface,
  point: StreamerTouchPoint,
): { x: number; y: number } {
  let xRatio: number;
  let yRatio: number;
  if (surface.rotation === 90) {
    xRatio = 1 - point.relY;
    yRatio = point.relX;
  } else if (surface.rotation === 270) {
    xRatio = point.relY;
    yRatio = 1 - point.relX;
  } else {
    xRatio = point.relX;
    yRatio = point.relY;
  }

  return {
    x: Math.round(xRatio * surface.width),
    y: Math.round(yRatio * surface.height),
  };
}

function cookStreamerTouchCommand(displayId: number, command: string): string {
  return `${displayId}:${command}\n`;
}
