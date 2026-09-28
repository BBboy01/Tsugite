import { describe, expect, it } from "bun:test";
import {
  dispatchRuntimeAction,
  dispatchRuntimeActionComplete,
  runRuntimeAction,
  subscribeRuntimeAction,
  subscribeRuntimeActionComplete,
} from "./runtime-actions";

describe("runtime action events", () => {
  it("delivers typed runtime actions and completion through the same event target", () => {
    const target = new EventTarget();
    const received: string[] = [];
    const unsubscribeAction = subscribeRuntimeAction(
      (action) => received.push(`run:${action}`),
      target,
    );
    const unsubscribeComplete = subscribeRuntimeActionComplete(
      (action) => received.push(`done:${action}`),
      target,
    );

    dispatchRuntimeAction("restart", target);
    dispatchRuntimeActionComplete("restart", target);

    expect(received).toEqual(["run:restart", "done:restart"]);
    unsubscribeAction();
    unsubscribeComplete();
  });

  it("stops delivering events after a subscription is removed", () => {
    const target = new EventTarget();
    const received: string[] = [];
    const unsubscribe = subscribeRuntimeAction((action) => received.push(action), target);

    unsubscribe();
    dispatchRuntimeAction("reinstall", target);

    expect(received).toEqual([]);
  });

  it("notifies completion when an action fails without swallowing the error", async () => {
    const target = new EventTarget();
    const received: string[] = [];
    subscribeRuntimeActionComplete((action) => received.push(action), target);
    const failure = new Error("restart failed");

    await expect(runRuntimeAction("restart", () => Promise.reject(failure), target)).rejects.toBe(
      failure,
    );

    expect(received).toEqual(["restart"]);
  });
});
