import { describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  watchForUpdates,
  type ContainerLike,
  type RegistrationLike,
  type WorkerLike,
} from './service-worker.ts';

class FakeWorker extends EventTarget implements WorkerLike {
  state = 'installing';
  postMessage = vi.fn();

  moveTo(state: string) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget implements RegistrationLike {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;

  found(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget implements ContainerLike {
  readonly controller: unknown;

  constructor(controller: unknown) {
    super();
    this.controller = controller;
  }
}

describe('watchForUpdates', () => {
  it('reports a new version once it has installed beside the current one', () => {
    const registration = new FakeRegistration();
    const onWaiting = vi.fn();
    watchForUpdates(registration, new FakeContainer({}), onWaiting);

    const worker = new FakeWorker();
    registration.found(worker);
    expect(onWaiting).not.toHaveBeenCalled();
    worker.moveTo('installed');
    expect(onWaiting).toHaveBeenCalledWith(worker);
  });

  it('reports a version that was already waiting when the page opened', () => {
    const registration = new FakeRegistration();
    const worker = new FakeWorker();
    worker.state = 'installed';
    registration.waiting = worker;
    const onWaiting = vi.fn();
    watchForUpdates(registration, new FakeContainer({}), onWaiting);
    expect(onWaiting).toHaveBeenCalledWith(worker);
  });

  it('stays quiet on a first install, when no worker controls the page', () => {
    const registration = new FakeRegistration();
    const onWaiting = vi.fn();
    watchForUpdates(registration, new FakeContainer(null), onWaiting);
    const worker = new FakeWorker();
    registration.found(worker);
    worker.moveTo('installed');
    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe('applyUpdate', () => {
  it('asks the worker to take over and reloads once it has', () => {
    const worker = new FakeWorker();
    const container = new FakeContainer({});
    const reload = vi.fn();
    applyUpdate(worker, container, reload);

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
