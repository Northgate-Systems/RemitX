import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  toast,
  showToast,
  dismissToast,
  subscribeToasts,
  getToasts,
  __resetToastStoreForTests,
} from "@/lib/toast-store";

describe("toast-store", () => {
  beforeEach(() => {
    __resetToastStoreForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a toast and notifies subscribers", () => {
    const received: string[][] = [];
    subscribeToasts((toasts) => received.push(toasts.map((t) => t.message)));

    showToast("Saved", "success");

    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0].message).toBe("Saved");
    expect(getToasts()[0].variant).toBe("success");
    // First call is the initial snapshot (empty), second is after showToast.
    expect(received[received.length - 1]).toEqual(["Saved"]);
  });

  it("defaults to the info variant", () => {
    showToast("Heads up");
    expect(getToasts()[0].variant).toBe("info");
  });

  it("auto-dismisses after the given duration", () => {
    showToast("Bye soon", "info", 1000);
    expect(getToasts()).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(getToasts()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  it("never auto-dismisses when duration is 0", () => {
    showToast("Sticks around", "info", 0);
    vi.advanceTimersByTime(1_000_000);
    expect(getToasts()).toHaveLength(1);
  });

  it("dismissToast removes a specific toast and is a no-op if already gone", () => {
    const id = showToast("First");
    showToast("Second");
    expect(getToasts()).toHaveLength(2);

    dismissToast(id);
    expect(getToasts().map((t) => t.message)).toEqual(["Second"]);

    // Dismissing again should not throw or emit a duplicate removal.
    expect(() => dismissToast(id)).not.toThrow();
    expect(getToasts()).toHaveLength(1);
  });

  it("dismissing one toast does not cancel another toast's timer", () => {
    const idA = showToast("A", "info", 500);
    showToast("B", "info", 1000);

    dismissToast(idA);
    expect(getToasts().map((t) => t.message)).toEqual(["B"]);

    vi.advanceTimersByTime(1000);
    expect(getToasts()).toHaveLength(0);
  });

  it("unsubscribe stops further notifications", () => {
    const received: number[] = [];
    const unsubscribe = subscribeToasts((toasts) => received.push(toasts.length));
    const callsAfterSubscribe = received.length;

    unsubscribe();
    showToast("After unsubscribe");

    expect(received).toHaveLength(callsAfterSubscribe);
  });

  it("the toast.success/error/info helpers set the matching variant", () => {
    toast.success("ok");
    toast.error("bad");
    toast.info("fyi");

    const variants = getToasts().map((t) => t.variant);
    expect(variants).toEqual(["success", "error", "info"]);
  });

  it("toast.dismiss is the same as dismissToast", () => {
    const id = toast.success("ok");
    toast.dismiss(id);
    expect(getToasts()).toHaveLength(0);
  });
});
